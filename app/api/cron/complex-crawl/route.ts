/**
 * GET /api/cron/complex-crawl
 * best-effort 단지 시세 크롤 (기본 비활성). KB_CRAWL_ENABLED=1 + KB_COMPLEX_API_URL 설정 시에만 동작.
 * 보호: CRON_SECRET / x-vercel-cron / 관리자.
 */
import { NextResponse } from "next/server";
import { crawlComplexPrices } from "@/lib/crawl/complex";
import { isAdminApiRequest } from "@/lib/admin/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorized =
    fromVercelCron || (expected ? provided === expected : true) || (await isAdminApiRequest());
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const result = await crawlComplexPrices();
  return NextResponse.json(result, { status: result.status === "error" ? 502 : 200 });
}
