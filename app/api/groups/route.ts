import { NextResponse, type NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { createMeeting, listMeetings } from "@/lib/meetings/store-db";

export const runtime = "nodejs";

/**
 * 모임 목록.
 *
 * listMeetings 는 조회에 실패하면 던진다(예전에는 빈 배열을 돌려줬다 — 그러면
 * 받는 쪽은 "모임이 하나도 없다"로 읽는다). 여기서 그 예외를 200 `{groups: []}`
 * 로 바꿔 버리면 같은 거짓말이 되므로, **못 줬다는 사실**을 503 으로 준다.
 */
export async function GET() {
  try {
    const groups = await listMeetings();
    return NextResponse.json({ groups });
  } catch {
    return NextResponse.json(
      {
        error:
          "모임 목록을 지금 불러오지 못했어요. 모임이 없는 게 아니라 조회에 실패한 상태입니다.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  // 모임 개설 보호(#5) — 로그인 필수. 예전 "게스트" 폴백은 익명 스팸 개설을 허용했다.
  const session = await safeAuth();
  const sessionEmail = session?.user?.email?.trim();
  if (!sessionEmail) {
    return NextResponse.json({ error: "로그인 후 모임을 만들 수 있어요." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const city = String(body.city ?? "").trim();
  const district = String(body.district ?? "").trim();
  const meetType = String(body.meetType ?? body.category ?? "스터디").trim();
  const maxMembers = Math.min(200, Math.max(2, Number(body.maxMembers ?? 20)));
  const nextAt = String(body.nextAt ?? body.scheduledAt ?? "").trim() || null;
  const fee = Math.max(0, Number(body.fee ?? 0));
  const isPublic = body.isPublic !== false;
  const tagsRaw = body.tags;
  const tags =
    typeof tagsRaw === "string"
      ? tagsRaw.split(/[#,]/g).map((t) => t.trim()).filter(Boolean)
      : Array.isArray(tagsRaw) ? tagsRaw.map(String) : [];

  if (!title || title.length < 2) {
    return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
  }
  if (!district) {
    return NextResponse.json({ error: "시·군·구를 선택해 주세요." }, { status: 400 });
  }

  const organizerLabel =
    session?.user?.name?.trim() || sessionEmail.split("@")[0]?.trim() || "회원";
  const organizerEmail = sessionEmail;

  try {
    const group = await createMeeting({
      organizerEmail,
      organizerLabel,
      title,
      description: description || "모임 소개를 입력해 주세요.",
      region: `${city || "서울특별시"} ${district}`.trim(),
      category: meetType,
      scheduledAt: nextAt,
      maxMembers,
      fee,
      isPublic,
      tags,
    });
    return NextResponse.json({ group }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "생성 실패" },
      { status: 500 },
    );
  }
}
