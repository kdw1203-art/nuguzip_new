/** R-ONE Open API → market_* 테이블 적재. */
import { logger } from "@/lib/log";
import {
  upsertSeries,
  upsertRegionPrices,
  logIngest,
} from "@/lib/market/store";
import type { MarketSeriesRow, MarketRegionPriceRow } from "@/lib/market/types";
import { REB_STATS } from "./stat-codes";
import { fetchRebStat, isRebConfigured, SIDO_SEOUL_ID } from "./client";
import { getServiceSupabase } from "@/lib/supabase/service";

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
  /* [938] 서울 광역 월간 지수(아파트 매매·전세) — market_price_indices 전용.
     `${index_type}|${yyyymm}` -> value. 구 단위 표·시계열에는 절대 섞지 않는다. */
  const seoulCitywide = new Map<string, number>();

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
      /* [938] 광역 서울 행 — 홈 티커가 읽는 서울 공식 지수의 유일한 적재 통로.
         (이 표를 쓰던 외부 적재가 07-17 이후 끊겨 홈이 5월 지수를 띄우고 있었다) */
      if (r.region.id === SIDO_SEOUL_ID) {
        if (
          stat.periodType === "monthly" &&
          stat.propertyType === "apt" &&
          (stat.metric === "sale_index" || stat.metric === "jeonse_index") &&
          /^\d{6}$/.test(r.rawPeriod)
        ) {
          const indexType = stat.metric === "sale_index" ? "reb_apt_sale" : "reb_apt_jeonse";
          seoulCitywide.set(`${indexType}|${r.rawPeriod}`, r.value);
        }
        continue; // 광역 행은 구 단위 시계열·가격 스냅샷에 넣지 않는다
      }
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

  /* [938] 서울 광역 지수 upsert — PK (source, region_code, index_type, month).
     기존 행(source='REB', region_code='SEOUL')과 같은 표기를 그대로 따른다.
     실패해도 구 단위 적재를 볼모로 잡지 않는다(경고만). */
  let citywideCount = 0;
  if (seoulCitywide.size > 0) {
    const sb = getServiceSupabase();
    if (sb) {
      const nowIso = new Date().toISOString();
      const rows = [...seoulCitywide.entries()].map(([key, value]) => {
        const [indexType, month] = key.split("|");
        return {
          source: "REB",
          region_code: "SEOUL",
          region_name: "서울",
          index_type: indexType,
          month,
          value,
          updated_at: nowIso,
        };
      });
      const { error } = await sb
        .from("market_price_indices")
        .upsert(rows, { onConflict: "source,region_code,index_type,month" });
      if (error) {
        logger.warn("[reb.ingest] 서울 광역 지수 upsert 실패", error.message);
      } else {
        citywideCount = rows.length;
      }
    }
  }

  await logIngest({
    source: "reb",
    dataset: "전국주택가격동향·오피스텔·거래현황",
    origin: "api",
    rows: seriesRows + priceCount + citywideCount,
    status: "ok",
    message: `series=${seriesRows} price=${priceCount} seoulIdx=${citywideCount}`,
  });

  return { ok: true, seriesRows, priceRows: priceCount, byStat };
}
