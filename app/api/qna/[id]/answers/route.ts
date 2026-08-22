import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createAnswer } from "@/lib/qna/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 답변 등록 — 로그인 필요, 사용자당 시간당 40건. { ok, id } 반환. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const rl = rateLimit(`qna:answer:${email}`, { limit: 40, windowMs: 60 * 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const b = raw as Record<string, unknown>;
  const body = String(b.body ?? "").trim();

  const result = await createAnswer({ questionId: id, email, body });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "답변 등록에 실패했어요." },
      { status: 400 },
    );
  }
  // /qna/[id] 는 ISR(600s)이다. 재생성 없이는 방금 단 답변이 최대 10분간
  // 캐시에 가려 "등록이 안 된" 것처럼 보인다 — 성공 시 즉시 재생성.
  revalidatePath(`/qna/${id}`);
  // 목록(/qna)의 답변 수·"답변 완료" 배지도 같은 답변으로 바뀐다 — 상세만
  // 재생성하면 목록이 최대 5분(ISR 300s) 동안 반대로 말한다. 함께 재생성.
  revalidatePath("/qna");

  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
