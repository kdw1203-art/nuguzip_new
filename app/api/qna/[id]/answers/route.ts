import { NextResponse } from "next/server";
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
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
