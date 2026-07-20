/**
 * GET /api/ai/market-baseline?regionId=gangnam
 * 시장·대출 시나리오의 기준 시세 프리필용 — 지역 실시세 스냅샷(읽기 전용).
 * LLM 미사용(규칙/데이터 조회 전용)이라 일반 READ 레이트 리밋을 적용한다.
 * 데이터 없으면 { available:false } (graceful).
 */
import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getRegionSnapshot } from "@/lib/market/store";
import { formatEokWon } from "@/lib/ai/market-insight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const regionId = (new URL(req.url).searchParams.get("regionId") ?? "").trim();
  if (!regionId) return NextResponse.json({ available: false });

  try {
    const snap = await getRegionSnapshot(regionId);
    const avgSaleWon =
      typeof snap?.avgSale === "number" && snap.avgSale > 0
        ? snap.avgSale
        : typeof snap?.medianSale === "number" && snap.medianSale > 0
          ? snap.medianSale
          : null;
    if (!snap || !avgSaleWon) return NextResponse.json({ available: false });
    return NextResponse.json({
      available: true,
      regionId: snap.regionId,
      regionName: snap.regionName,
      period: snap.period,
      source: snap.source,
      avgSaleWon,
      avgSaleLabel: formatEokWon(avgSaleWon),
      saleChangeMonthly:
        typeof snap.saleChangeMonthly === "number" ? snap.saleChangeMonthly : null,
      jeonseRatio: typeof snap.jeonseRatio === "number" ? snap.jeonseRatio : null,
    });
  } catch {
    return NextResponse.json({ available: false });
  }
}
