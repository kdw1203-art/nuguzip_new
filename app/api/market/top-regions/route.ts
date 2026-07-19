/**
 * GET /api/market/top-regions?limit=5
 * REB·KB 스냅샷 기준 거래량 상위 지역. 데이터 없으면 정적 SEOUL_DISTRICTS 폴백.
 */
import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getAllRegionSnapshots } from "@/lib/market/store";
import { SEOUL_DISTRICTS } from "@/lib/map/seoul-districts";

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

  const rows = SEOUL_DISTRICTS.map((d) => ({
    id: d.id,
    name: d.name,
    avgPricePerM2: d.avgPricePerM2 ?? 0,
    momPct: d.momPct ?? 0,
    tradeCount30d: d.tradeCount30d ?? 0,
  }))
    .sort((a, b) => b.tradeCount30d - a.tradeCount30d)
    .slice(0, limit);
  return NextResponse.json({ live: false, source: "mock", rows });
}
