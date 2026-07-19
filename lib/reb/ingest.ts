/** R-ONE Open API → market_* 테이블 적재. */
import { logger } from "@/lib/log";
import {
  upsertSeries,
  upsertRegionPrices,
  logIngest,
} from "@/lib/market/store";
import type { MarketSeriesRow, MarketRegionPriceRow } from "@/lib/market/types";
import { REB_STATS } from "./stat-codes";
import { fetchRebStat, isRebConfigured } from "./client";

const PRICE_SCALE = 1000; // R-ONE 가격 단위: 천원 → 원

export interface RebIngestResult {
  ok: boolean;
  skipped?: boolean;
  seriesRows: number;
  priceRows: number;
  byStat: Record<string, number>;
}

export async function ingestReb(
  opts: { monthPages?: number; weekPages?: number } = {},
): Promise<RebIngestResult> {
  if (!isRebConfigured()) {
    await logIngest({ source: "reb", dataset: "all", origin: "api", rows: 0, status: "skipped", message: "REB_OPENAPI_KEY 미설정" });
    return { ok: false, skipped: true, seriesRows: 0, priceRows: 0, byStat: {} };
  }

  const allSeries: MarketSeriesRow[] = [];
  const byStat: Record<string, number> = {};
  // 가격 스냅샷: regionId -> { 최신월, 필드 }
  const priceAcc = new Map<
    string,
    { regionName: string; period: string; perM2Sale?: number; avgSale?: number; medianSale?: number; avgJeonse?: number }
  >();
  // 월간 지표 최신/직전 계산용: `${regionId}|${metric}` -> [{period(yyyymm), value}]
  const monthlyByKey = new Map<string, Array<{ period: string; value: number }>>();

  for (const stat of REB_STATS) {
    let rows: Awaited<ReturnType<typeof fetchRebStat>> = [];
    try {
      rows = await fetchRebStat(stat, opts);
    } catch (err) {
      logger.warn(`[reb.ingest] ${stat.label} fetch failed`, err);
      byStat[stat.label] = 0;
      continue;
    }
    byStat[stat.label] = rows.length;

    for (const r of rows) {
      if (stat.metric) {
        allSeries.push({
          source: "reb",
          regionId: r.region.id,
          regionName: r.region.name,
          level: "sigungu",
          propertyType: stat.propertyType,
          metric: stat.metric,
          periodType: stat.periodType,
          period: r.period,
          value: r.value,
        });
        if (stat.periodType === "monthly") {
          const key = `${r.region.id}|${stat.metric}`;
          const arr = monthlyByKey.get(key) ?? [];
          arr.push({ period: r.rawPeriod, value: r.value });
          monthlyByKey.set(key, arr);
        }
      }
      if (stat.priceField && stat.propertyType === "apt") {
        const cur = priceAcc.get(r.region.id);
        const scaled = r.value * PRICE_SCALE;
        if (!cur || r.rawPeriod > cur.period) {
          const next = cur && r.rawPeriod === cur.period ? cur : { regionName: r.region.name, period: r.rawPeriod };
          priceAcc.set(r.region.id, { ...next, [stat.priceField]: scaled });
        } else if (r.rawPeriod === cur.period) {
          cur[stat.priceField] = scaled;
        }
      }
    }
  }

  const seriesRows = await upsertSeries(allSeries);

  // ── 가격 스냅샷 행 구성 ──
  const latestMonthly = (regionId: string, metric: string): number | undefined => {
    const arr = monthlyByKey.get(`${regionId}|${metric}`);
    if (!arr || arr.length === 0) return undefined;
    arr.sort((a, b) => a.period.localeCompare(b.period));
    return arr[arr.length - 1]?.value;
  };
  const monthlyChange = (regionId: string): number | undefined => {
    const arr = monthlyByKey.get(`${regionId}|sale_index`);
    if (!arr || arr.length < 2) return undefined;
    arr.sort((a, b) => a.period.localeCompare(b.period));
    const cur = arr[arr.length - 1].value;
    const prev = arr[arr.length - 2].value;
    if (!prev) return undefined;
    return Math.round(((cur - prev) / prev) * 10000) / 100;
  };

  const regionIds = new Set<string>([...priceAcc.keys()]);
  for (const key of monthlyByKey.keys()) regionIds.add(key.split("|")[0]);

  const priceRows: MarketRegionPriceRow[] = [];
  for (const regionId of regionIds) {
    const price = priceAcc.get(regionId);
    const period =
      price?.period ??
      (monthlyByKey.get(`${regionId}|sale_index`)?.slice(-1)[0]?.period ?? "");
    const regionName =
      price?.regionName ??
      allSeries.find((s) => s.regionId === regionId)?.regionName ??
      regionId;
    priceRows.push({
      source: "reb",
      regionId,
      regionName,
      propertyType: "apt",
      period,
      perM2Sale: price?.perM2Sale,
      avgSale: price?.avgSale,
      medianSale: price?.medianSale,
      avgJeonse: price?.avgJeonse,
      jeonseRatio: latestMonthly(regionId, "jeonse_ratio"),
      saleChange: monthlyChange(regionId),
      tradeCount: latestMonthly(regionId, "trade_count"),
      buySuperiority: latestMonthly(regionId, "buy_superiority"),
      jeonseSupply: latestMonthly(regionId, "jeonse_supply"),
    });
  }

  const priceCount = await upsertRegionPrices(priceRows);

  await logIngest({
    source: "reb",
    dataset: "전국주택가격동향·오피스텔·거래현황",
    origin: "api",
    rows: seriesRows + priceCount,
    status: "ok",
    message: `series=${seriesRows} price=${priceCount}`,
  });

  return { ok: true, seriesRows, priceRows: priceCount, byStat };
}
