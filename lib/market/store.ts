/** market_* 테이블 읽기/쓰기 (서버 전용). Supabase 미설정 시 안전하게 빈 값 반환. */
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import type {
  MarketSeriesRow,
  MarketRegionPriceRow,
  MarketSource,
  PeriodType,
  MarketMetric,
  RegionMarketSnapshot,
  RegionDemographics,
} from "./types";

let demographicsCache: { at: number; map: Map<string, RegionDemographics> } | null = null;

const SNAPSHOT_TTL_MS = 60 * 60 * 1000; // 1h
let snapshotCache: { at: number; map: Map<string, RegionMarketSnapshot> } | null = null;
let hasDataCache: { at: number; value: boolean } | null = null;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function upsertSeries(rows: MarketSeriesRow[]): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb || rows.length === 0) return 0;
  // 동일 upsert 배치에 동일 충돌키(중복)가 있으면 Postgres 가 전체 문을 거부한다
  // ("ON CONFLICT ... cannot affect row a second time"). 충돌키 기준으로 마지막 값만 유지.
  const dedup = new Map<string, MarketSeriesRow>();
  for (const r of rows) {
    dedup.set(
      `${r.source}|${r.regionId}|${r.propertyType}|${r.metric}|${r.periodType}|${r.period}`,
      r,
    );
  }
  const deduped = [...dedup.values()];
  let n = 0;
  for (const part of chunk(deduped, 500)) {
    const payload = part.map((r) => ({
      source: r.source,
      region_id: r.regionId,
      region_name: r.regionName,
      level: r.level,
      property_type: r.propertyType,
      metric: r.metric,
      period_type: r.periodType,
      period: r.period,
      value: r.value,
      dataset_date: r.datasetDate ?? null,
      updated_at: new Date().toISOString(),
    }));
    const { error, count } = await sb
      .from("market_region_series")
      .upsert(payload, {
        onConflict: "source,region_id,property_type,metric,period_type,period",
        count: "exact",
      });
    if (error) {
      logger.warn("[market.store] upsertSeries error", error.message);
    } else {
      n += count ?? part.length;
    }
  }
  snapshotCache = null;
  hasDataCache = null;
  demographicsCache = null;
  return n;
}

export async function upsertRegionPrices(rows: MarketRegionPriceRow[]): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb || rows.length === 0) return 0;
  const payload = rows.map((r) => ({
    source: r.source,
    region_id: r.regionId,
    region_name: r.regionName,
    property_type: r.propertyType,
    period: r.period,
    avg_sale: r.avgSale ?? null,
    median_sale: r.medianSale ?? null,
    per_m2_sale: r.perM2Sale ?? null,
    avg_jeonse: r.avgJeonse ?? null,
    jeonse_ratio: r.jeonseRatio ?? null,
    sale_change: r.saleChange ?? null,
    trade_count: r.tradeCount ?? null,
    buy_superiority: r.buySuperiority ?? null,
    jeonse_supply: r.jeonseSupply ?? null,
    updated_at: new Date().toISOString(),
  }));
  const { error, count } = await sb
    .from("market_region_price")
    .upsert(payload, { onConflict: "source,region_id,property_type", count: "exact" });
  if (error) {
    logger.warn("[market.store] upsertRegionPrices error", error.message);
    return 0;
  }
  snapshotCache = null;
  hasDataCache = null;
  return count ?? rows.length;
}

export interface ComplexPriceRow {
  source: "kb" | "crawl";
  complexId: string;
  name: string;
  regionId?: string;
  lat?: number;
  lng?: number;
  areaM2?: number;
  saleLower?: number;
  saleGeneral?: number;
  saleUpper?: number;
  jeonseLower?: number;
  jeonseGeneral?: number;
  jeonseUpper?: number;
}

export async function upsertComplexPrices(rows: ComplexPriceRow[]): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb || rows.length === 0) return 0;
  const dedup = new Map<string, ComplexPriceRow>();
  for (const r of rows) dedup.set(`${r.source}|${r.complexId}|${r.areaM2 ?? ""}`, r);
  const deduped = [...dedup.values()];
  let n = 0;
  for (const part of chunk(deduped, 500)) {
    const payload = part.map((r) => ({
      source: r.source,
      complex_id: r.complexId,
      name: r.name,
      region_id: r.regionId ?? null,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      area_m2: r.areaM2 ?? null,
      sale_lower: r.saleLower ?? null,
      sale_general: r.saleGeneral ?? null,
      sale_upper: r.saleUpper ?? null,
      jeonse_lower: r.jeonseLower ?? null,
      jeonse_general: r.jeonseGeneral ?? null,
      jeonse_upper: r.jeonseUpper ?? null,
      updated_at: new Date().toISOString(),
    }));
    const { error, count } = await sb
      .from("market_complex_price")
      .upsert(payload, { onConflict: "source,complex_id,area_m2", count: "exact" });
    if (error) logger.warn("[market.store] upsertComplexPrices error", error.message);
    else n += count ?? part.length;
  }
  return n;
}

export async function logIngest(entry: {
  source: MarketSource;
  dataset: string;
  origin: "api" | "upload" | "cron-fetch" | "crawl";
  rows: number;
  status?: "ok" | "error" | "skipped";
  message?: string;
}): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) return;
  try {
    await sb.from("market_ingest_log").insert({
      source: entry.source,
      dataset: entry.dataset,
      origin: entry.origin,
      rows: entry.rows,
      status: entry.status ?? "ok",
      message: entry.message ?? null,
    });
  } catch {
    // non-critical
  }
}

export interface IngestLogRow {
  source: string;
  dataset: string;
  origin: string;
  rows: number;
  status: string;
  message: string | null;
  createdAt: string;
}

export async function listIngestLog(limit = 20): Promise<IngestLogRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("market_ingest_log")
    .select("source,dataset,origin,rows,status,message,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({
    source: String(r.source),
    dataset: String(r.dataset),
    origin: String(r.origin),
    rows: Number(r.rows),
    status: String(r.status),
    message: r.message ? String(r.message) : null,
    createdAt: String(r.created_at),
  }));
}

export async function hasMarketData(): Promise<boolean> {
  if (hasDataCache && Date.now() - hasDataCache.at < SNAPSHOT_TTL_MS) return hasDataCache.value;
  const sb = getServiceSupabase();
  if (!sb) {
    hasDataCache = { at: Date.now(), value: false };
    return false;
  }
  const { count } = await sb
    .from("market_region_price")
    .select("id", { count: "exact", head: true });
  const value = (count ?? 0) > 0;
  hasDataCache = { at: Date.now(), value };
  return value;
}

/** 모든 지역의 최신 스냅샷 맵 (REB 우선, 없으면 KB). 1h 캐시. */
export async function getAllRegionSnapshots(): Promise<Map<string, RegionMarketSnapshot>> {
  if (snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) return snapshotCache.map;
  const map = new Map<string, RegionMarketSnapshot>();
  const sb = getServiceSupabase();
  if (!sb) {
    snapshotCache = { at: Date.now(), map };
    return map;
  }
  const { data, error } = await sb
    .from("market_region_price")
    .select(
      "source,region_id,region_name,period,per_m2_sale,avg_sale,median_sale,jeonse_ratio,sale_change,trade_count,buy_superiority,jeonse_supply",
    )
    .eq("property_type", "apt");
  if (error || !data) {
    snapshotCache = { at: Date.now(), map };
    return map;
  }
  // REB 우선: 같은 region_id 에 대해 reb 가 kb 를 덮어쓴다.
  const priority: Record<string, number> = { reb: 2, kb: 1, crawl: 0 };
  for (const row of data) {
    const id = String(row.region_id);
    const existing = map.get(id);
    const src = String(row.source);
    if (existing && (priority[existing.source] ?? 0) >= (priority[src] ?? 0)) continue;
    map.set(id, {
      regionId: id,
      regionName: String(row.region_name),
      source: src as MarketSource,
      period: String(row.period),
      perM2Sale: row.per_m2_sale ?? undefined,
      avgSale: row.avg_sale ?? undefined,
      medianSale: row.median_sale ?? undefined,
      jeonseRatio: row.jeonse_ratio ?? undefined,
      saleChangeMonthly: row.sale_change ?? undefined,
      tradeCount: row.trade_count ?? undefined,
      buySuperiority: row.buy_superiority ?? undefined,
      jeonseSupply: row.jeonse_supply ?? undefined,
    });
  }
  snapshotCache = { at: Date.now(), map };
  return map;
}

export async function getRegionSnapshot(regionId: string): Promise<RegionMarketSnapshot | null> {
  const map = await getAllRegionSnapshots();
  return map.get(regionId) ?? null;
}

/** KOSIS 보조지표(인구·세대·미분양·보급률) 최신값 맵. 1h 캐시. */
export async function getAllRegionDemographics(): Promise<Map<string, RegionDemographics>> {
  if (demographicsCache && Date.now() - demographicsCache.at < SNAPSHOT_TTL_MS) {
    return demographicsCache.map;
  }
  const map = new Map<string, RegionDemographics>();
  const sb = getServiceSupabase();
  if (!sb) {
    demographicsCache = { at: Date.now(), map };
    return map;
  }
  const { data, error } = await sb
    .from("market_region_series")
    .select("region_id,region_name,metric,period,value")
    .eq("source", "kosis")
    .in("metric", ["population", "households", "unsold_units", "housing_supply_ratio"])
    .order("period", { ascending: true });
  if (error || !data) {
    demographicsCache = { at: Date.now(), map };
    return map;
  }
  const fieldByMetric: Record<string, keyof RegionDemographics> = {
    population: "population",
    households: "households",
    unsold_units: "unsoldUnits",
    housing_supply_ratio: "housingSupplyRatio",
  };
  for (const row of data) {
    const id = String(row.region_id);
    const field = fieldByMetric[String(row.metric)];
    if (!field) continue;
    const cur = map.get(id) ?? {
      regionId: id,
      regionName: String(row.region_name),
      period: String(row.period).slice(0, 7).replace("-", ""),
    };
    // period 오름차순이므로 마지막(최신)값이 덮어씀
    (cur as unknown as Record<string, number>)[field] = Number(row.value);
    cur.period = String(row.period).slice(0, 7).replace("-", "");
    map.set(id, cur);
  }
  demographicsCache = { at: Date.now(), map };
  return map;
}

export async function getRegionDemographics(regionId: string): Promise<RegionDemographics | null> {
  const map = await getAllRegionDemographics();
  return map.get(regionId) ?? null;
}

/** 특정 지역·지표 시계열 (오름차순). */
export async function getRegionSeries(
  regionId: string,
  metric: MarketMetric,
  periodType: PeriodType,
  limit = 24,
): Promise<Array<{ period: string; value: number }>> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("market_region_series")
    .select("period,value,source")
    .eq("region_id", regionId)
    .eq("property_type", "apt")
    .eq("metric", metric)
    .eq("period_type", periodType)
    .order("period", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data
    .map((r) => ({ period: String(r.period), value: Number(r.value) }))
    .reverse();
}
