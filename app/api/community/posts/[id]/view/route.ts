import { NextResponse } from "next/server";
import { incrementViewCount } from "@/lib/posts-store";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  /* 무인증 카운터 — 스크립트 한 개가 조회수를 부풀리지 않게 IP 상한. */
  const rl = rateLimit(`post-view:${getClientIp(req)}`, { limit: 60, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  const { id } = await ctx.params;
  const post = await incrementViewCount(id);
  if (!post) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ viewCount: post.viewCount });
}
