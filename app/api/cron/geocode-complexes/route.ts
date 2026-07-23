/**
 * GET /api/cron/geocode-complexes?limit=150
 * 실거래 단지(market_transactions)를 거래량 많은 순으로 네이버(NCP) 지오코딩 →
 * complex_geocode 캐시에 좌표 저장. 지도에서 개별 단지를 정확한 위치에 표시하기 위함.
 * 보호: CRON_SECRET · x-vercel-cron · 관리자 세션 중 하나.
 */
import { NextResponse } from "next/server";
import { backfillGeocode } from "@/lib/map/complex-geocode";
import { isNaverMapsRestConfigured } from "@/lib/map/naver-maps-rest";
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

  if (!isNaverMapsRestConfigured()) {
    return NextResponse.json(
      { ok: false, skipped: true, message: "NAVER Maps REST API 미설정" },
      { status: 200 },
    );
  }

  const limit = Math.min(400, Math.max(1, Number(url.searchParams.get("limit") ?? 150)));
  try {
    const result = await backfillGeocode(limit);
    // result: { processed, ok(성공 좌표수), skipped? } — 응답 성공 플래그는 success 로 분리
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "지오코딩 실패" },
      { status: 500 },
    );
  }
}
