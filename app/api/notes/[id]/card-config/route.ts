import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getNote, updateNote } from "@/lib/inspection/store-db";
import { toCardSource } from "@/lib/notes/card-source";
import { normalizeConfig } from "@/lib/notes/card-config";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

/**
 * POST /api/notes/[id]/card-config
 * "나만의 카드" 구성 저장 — 작성자 본인만. body: { themeId, frameIds }.
 *
 * 저장 전 normalizeConfig 로 정규화한다: 표지 강제·중복/무효/불가 프레임 제거·최소
 * 5장 보강. 사용자가 보낸 값을 그대로 믿지 않고, 그 노트에서 실제로 채울 수 있는
 * 프레임만 남긴다(빈 장 저장 금지 — 사실 우선). 반환값은 정규화된 최종 구성이라
 * 클라이언트가 그대로 반영하면 서버·화면이 일치한다.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  let note;
  try {
    note = await getNote(id);
  } catch (e) {
    logger.error("[card-config] note 조회 실패", e);
    return NextResponse.json({ error: "노트를 불러오지 못했어요." }, { status: 503 });
  }
  if (!note) return NextResponse.json({ error: "노트를 찾을 수 없습니다." }, { status: 404 });
  if (note.authorEmail.toLowerCase() !== email) {
    return NextResponse.json({ error: "본인 노트만 편집할 수 있어요." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    themeId?: string;
    frameIds?: string[];
  };
  const source = toCardSource(note);
  const normalized = normalizeConfig(
    { themeId: body.themeId, frameIds: Array.isArray(body.frameIds) ? body.frameIds : [] },
    source,
  );

  try {
    await updateNote(id, {
      metadata: { ...(note.metadata ?? {}), cardConfig: normalized },
    });
  } catch (e) {
    logger.error("[card-config] 저장 실패", e);
    return NextResponse.json({ error: "저장에 실패했어요. 다시 시도해 주세요." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, config: normalized });
}
