import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const GET = handlers.GET;

/** 로그인·OAuth·Credentials POST 공통 레이트리밋 (IP당 20회/10분) */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`auth-post:${getClientIp(req)}`, {
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  return handlers.POST(req);
}
