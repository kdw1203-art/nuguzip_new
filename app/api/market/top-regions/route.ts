/**
 * GET /api/market/top-regions?limit=5
 * REB·KB 스냅샷 기준 거래량 상위 지역.
 *
 * 사실 우선: 실집계가 없을 때 SEOUL_DISTRICTS 의 하드코딩 시세로 "거래량 상위
 * 지역" 순위를 만들어 내보내던 폴백을 삭제했다. `source: "mock"` 이라고 적어두긴
 * 했지만, 응답을 받는 쪽에서 그 필드를 읽는다는 보장이 없고 순위 자체가 근거가
 * 없었다(그 하드코딩 값들은 실제 REB 집계와 최대 2배까지 틀렸다).
 * 데이터가 없으면 빈 목록을 반환한다.
 */
import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getAllRegionSnapshots } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  const limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit") ?? "5") || 5));

  const snapshots = await getAllRegionSnapshots().catch(() => new Map());
  const withTrade = [...snapshots.values()].filter(
    (s) => typeof s.tradeCount === "number" || typeof s.perM2Sale === "number",
  );

  if (withTrade.length > 0) {
    const rows = withTrade
      .map((s) => ({
        id: s.regionId,
        name: s.regionName,
        avgPricePerM2: s.perM2Sale ?? 0,
        momPct: typeof s.saleChangeMonthly === "number" ? s.saleChangeMonthly : 0,
        tradeCount30d: typeof s.tradeCount === "number" ? Math.round(s.tradeCount) : 0,
      }))
      .sort((a, b) => b.tradeCount30d - a.tradeCount30d || b.avgPricePerM2 - a.avgPricePerM2)
      .slice(0, limit);
    return NextResponse.json(
      { live: true, source: withTrade[0].source ?? "reb", rows },
      { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600" } },
    );
  }

  // 실집계 없음 — 순위를 지어내지 않는다.
  return NextResponse.json({ live: false, source: null, rows: [] });
}
