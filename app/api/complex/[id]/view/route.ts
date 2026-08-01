/**
 * POST /api/complex/[id]/view — 단지 상세 조회수 +1.
 */
import { NextResponse } from "next/server";
import { recordComplexView } from "@/lib/listings/engagement";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  /* 무인증 카운터 — 스크립트 한 개가 조회수를 부풀리지 않게 IP 상한. */
  const rl = rateLimit(`complex-view:${getClientIp(req)}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  const { id } = await ctx.params;
  await recordComplexView(id);
  return NextResponse.json({ ok: true });
}
