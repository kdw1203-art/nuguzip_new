/**
 * GET /api/market/region-trend?regionId=seoul-gangnam  (또는 ?district=강남구&city=서울)
 * 한 지역의 REB·KB 시장 동향 스냅샷 + 주간 매매/전세 지수 시계열.
 * 데이터 없으면 { available:false } 반환(위젯은 숨김).
 */
import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getRegionSnapshot, getRegionSeries } from "@/lib/market/store";
import { matchRegionByName } from "@/lib/market/region-code";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function weeklyChange(series: Array<{ period: string; value: number }>) {
  const out: Array<{ period: string; changePct: number }> = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1].value;
    const cur = series[i].value;
    out.push({
      period: series[i].period,
      changePct: prev ? Math.round(((cur - prev) / prev) * 10000) / 100 : 0,
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  let regionId = url.searchParams.get("regionId") ?? "";
  const district = url.searchParams.get("district") ?? "";
  const city = url.searchParams.get("city") ?? undefined;
  if (!regionId && district) {
    const m = matchRegionByName(district, city);
    if (m) regionId = m.id;
  }
  if (!regionId) {
    return NextResponse.json({ available: false }, { status: 200 });
  }

  const [snapshot, saleIdx, jeonseIdx] = await Promise.all([
    getRegionSnapshot(regionId).catch(() => null),
    getRegionSeries(regionId, "sale_index", "weekly", 14).catch(() => []),
    getRegionSeries(regionId, "jeonse_index", "weekly", 14).catch(() => []),
  ]);

  if (!snapshot && saleIdx.length === 0) {
    return NextResponse.json({ available: false }, { status: 200 });
  }

  const weeklySale = weeklyChange(saleIdx);
  const weeklyJeonse = weeklyChange(jeonseIdx);

  return NextResponse.json(
    {
      available: true,
      source: snapshot?.source ?? "reb",
      regionId,
      snapshot: snapshot
        ? {
            period: snapshot.period,
            perM2Sale: snapshot.perM2Sale,
            saleChangeMonthly: snapshot.saleChangeMonthly,
            jeonseRatio: snapshot.jeonseRatio,
            tradeCount: snapshot.tradeCount,
            buySuperiority: snapshot.buySuperiority,
            jeonseSupply: snapshot.jeonseSupply,
          }
        : null,
      weeklySale,
      weeklyJeonse,
      latestWeeklySale: weeklySale.at(-1)?.changePct ?? null,
      latestWeeklyJeonse: weeklyJeonse.at(-1)?.changePct ?? null,
    },
    { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600" } },
  );
}
