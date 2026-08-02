/**
 * GET /api/cron/complex-crawl
 * best-effort 단지 시세 크롤 (기본 비활성). KB_CRAWL_ENABLED=1 + KB_COMPLEX_API_URL 설정 시에만 동작.
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 */
import { NextResponse } from "next/server";
import { crawlComplexPrices } from "@/lib/crawl/complex";
import { authorizeCron } from "@/lib/cron/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const result = await crawlComplexPrices();
  return NextResponse.json(result, { status: result.status === "error" ? 502 : 200 });
}
