import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { listQuestions, createQuestion } from "@/lib/qna/store";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 질문 목록 — ?status= 로 상태 필터. { items } 반환. */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status")?.trim() || undefined;
  /* 2026-07-26: store 가 실패 때 `[]` 를 돌려주던 걸 던지도록 고쳤다. 여기서
     삼켜서 `{ items: [] }` 를 주면 클라이언트는 "질문 없음"으로 그린다 —
     조회 실패는 200 빈 목록이 아니라 503 이다. */
  try {
    const items = await listQuestions({ status });
    return NextResponse.json({ items });
  } catch (e) {
    logger.error("[api/qna] 질문 목록 조회 실패", e);
    return NextResponse.json(
      { error: "질문 목록을 지금 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }
}

/** 질문 등록 — 로그인 필요, 사용자당 시간당 20건. { ok, id } 반환. */
export async function POST(req: NextRequest) {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const rl = rateLimit(`qna:create:${email}`, { limit: 20, windowMs: 60 * 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const b = raw as Record<string, unknown>;
  const title = String(b.title ?? "").trim();
  if (title.length < 4) {
    return NextResponse.json(
      { error: "제목은 4글자 이상 입력해 주세요." },
      { status: 400 },
    );
  }

  const body = String(b.body ?? "").trim();
  const complexName = b.complexName != null ? String(b.complexName).trim() : undefined;
  const region = b.region != null ? String(b.region).trim() : undefined;
  const tags = parseTags(b.tags);

  // 현상금 포인트는 검증·차감·지급 실체가 없어 접수하지 않는다(AskForm 필드도 제거, #8).
  const result = await createQuestion({
    email,
    title,
    body,
    complexName,
    region,
    tags,
    bountyPoints: 0,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "질문 등록에 실패했어요." },
      { status: 400 },
    );
  }
  // /qna 목록은 ISR(5분)이다 — 재생성 없이는 방금 등록한 질문이 목록에서
  // 최대 5분간 안 보인다. 성공 시 즉시 재생성.
  revalidatePath("/qna");

  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}

/** 태그: 쉼표(#) 구분 문자열 또는 배열 모두 허용 → 정리된 문자열 배열. */
function parseTags(v: unknown): string[] {
  if (typeof v === "string") {
    return v
      .split(/[#,]/g)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10);
  }
  if (Array.isArray(v)) {
    return v
      .map((t) => String(t).trim())
      .filter(Boolean)
      .slice(0, 10);
  }
  return [];
}

/** 현상금 포인트: 숫자/숫자문자열만 허용, 음수·NaN 은 0 으로. */