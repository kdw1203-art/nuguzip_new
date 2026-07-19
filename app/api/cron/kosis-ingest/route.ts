/**
 * GET /api/cron/kosis-ingest
 * KOSIS 국가통계포털 Open API → market_region_series 적재(인구·세대·미분양·보급률).
 * Vercel Cron(3일 주기) 또는 수동 호출. 보호: CRON_SECRET 또는 관리자 세션.
 */
import { NextResponse } from "next/server";
import { ingestKosis } from "@/lib/kosis/ingest";
import { isKosisConfigured } from "@/lib/kosis/client";
import { isAdminApiRequest } from "@/lib/admin/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";

  const authorized =
    fromVercelCron ||
    (expected ? provided === expected : true) ||
    (await isAdminApiRequest());
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  if (!isKosisConfigured()) {
    return NextResponse.json(
      { ok: false, skipped: true, message: "KOSIS_API_KEY 미설정" },
      { status: 200 },
    );
  }

  const recentCount = Number(url.searchParams.get("recentCount") ?? "2") || 2;

  try {
    const result = await ingestKosis({ recentCount });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "수집 실패" },
      { status: 500 },
    );
  }
}
