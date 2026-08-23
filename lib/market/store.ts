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

/**
 * 조회 실패는 "데이터 없음"이 아니다.
 *
 * 예전에는 이 파일의 지역 로더들이 PostgREST 오류를 삼키고 빈 값을 돌려줬다.
 * 그러면 화면은 "데이터를 준비 중입니다"를 띄우고, /region/[id] 는 스냅샷이
 * null 이라며 404 를 냈다. DB 가 잠깐 느려진 것뿐인데 크롤러에게 "이 지역
 * 페이지는 없어졌다"고 확정 신고한 셈이다. 게다가 getAllRegionSnapshots 는
 * 그 빈 결과를 한 시간 캐시까지 해서, 장애가 끝난 뒤에도 한 시간 동안 404 가
 * 이어졌다.
 *
 * 그래서 실패는 던진다(→ 5xx = "지금은 못 준다, 나중에 다시 와라"). 빈 배열은
 * 이제 "정말로 없다"만 뜻한다.
 *
 * 다만 `getServiceSupabase()` 가 null 인 경우는 던지지 않는다 — CI 프리렌더
 * 환경에는 서비스 키가 없고, 그건 장애가 아니라 "이 환경에서는 못 읽는다"는
 * 정상 상태다. 여기서 던지면 빌드가 깨진다.
 */
function throwQueryFailure(what: string, error: { message?: string } | null): never {
  const detail = error?.message ? `: ${error.message}` : "";
  throw new Error(`[market.store] ${what} 조회 실패${detail}`);
}

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

/**
 * F3 — 적재 로그 소스. market_* 계열(MarketSource) 외에 실거래·단지마스터·금리·
 * 공매/경매·정비사업·지오코딩 크론도 같은 로그 테이블(market_ingest_log)에 남긴다.
 * DB 컬럼은 text 이고 CHECK 제약이 없어 마이그레이션 없이 확장 가능.
 */
export type IngestSource =
  | MarketSource
  | "molit"
  | "apt-master"
  | "apt-detail"
  | "ecos"
  | "economy-alerts"
  | "onbid"
  | "court-auction"
  | "redevelopment"
  /** 입주물량 자동 인제스트(app/api/cron/supply-ingest, 개선 #21) */
  | "supply"
  /** 신고가 자동 소식(app/api/cron/price-record-watch, #81) */
  | "news"
  /** 생활 인프라 표준데이터 — 학교·도시철도역(app/api/cron/poi-ingest, #96) */
  | "poi"
  | "geocode"
  /** 구독 만료 스윕(app/api/cron/plan-expiry-sweep) — 시장 데이터는 아니지만 크론 실행 기록은 같은 로그로 남긴다 */
  | "plan-expiry"
  /** 포인트 만료 스윕(app/api/cron/points-expiry-sweep) — 위와 같은 이유로 같은 로그를 쓴다 */
  | "points-expiry"
  /** 이메일 outbox 드레인(app/api/cron/notification-outbox-drain) — 위와 같은 이유 */
  | "notification-outbox"
  /** 토스 자동결제 갱신 크론(app/api/cron/billing-renewals) — 위와 같은 이유 */
  | "billing-renewals";

/**
 * F3(#147) — 크론이 던진 예외를 적재 로그에 남길 수 있는 한 줄짜리 사유로 만든다.
 *
 * 공공 API 오류 메시지에는 요청 URL 이 통째로 들어오는 경우가 있고, 그 URL 에는
 * serviceKey·apiKey 같은 인증키가 붙어 있다. 적재 로그(market_ingest_log)는
 * 어드민 화면에 그대로 표시되므로, 키로 보이는 쿼리 파라미터는 지운 뒤 저장한다.
 * 길이도 400자로 자른다(스택 트레이스가 통째로 들어오는 것을 막기 위함).
 */
export function ingestErrorMessage(err: unknown, fallback = "알 수 없는 오류"): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const text = raw.trim() || fallback;
  return text
    .replace(/([?&](?:serviceKey|apiKey|api_key|key|secret|token|auth_key|authKey)=)[^&\s"']+/gi, "$1***")
    .slice(0, 400);
}

export async function logIngest(entry: {
  source: IngestSource;
  dataset: string;
  origin: "api" | "upload" | "cron-fetch" | "crawl";
  rows: number;
  status?: "ok" | "error" | "skipped";
  message?: string;
}): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) return;
  try {
    /* 10초 상한. 이 기록은 크론이 작업 예산(CRON_WORK_BUDGET_MS)을 다 쓴 뒤
       남는 시간에 실행 결과를 남기는 용도인데, 쓰기는 resilient-fetch 의 상한
       대상이 아니라서 DB 가 밀리면 여기 매달려 함수 전체가 타임아웃으로 죽고
       — 정작 "시간 초과로 중단됨" 기록조차 못 남겼다. 기록은 10초 안에 되거나
       포기한다(non-critical). */
    await sb
      .from("market_ingest_log")
      .insert({
        source: entry.source,
        dataset: entry.dataset,
        origin: entry.origin,
        rows: entry.rows,
        status: entry.status ?? "ok",
        message: entry.message ?? null,
      })
      .abortSignal(AbortSignal.timeout(10_000));
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

/**
 * 최적화 4 — 이 조회의 **안전 상한**. 상한을 거는 목적이 보통과 반대다.
 *
 * 여긴 "전 지역 스냅샷 맵"이라, 흔히 하듯 `.limit(100)` 을 걸면 지역이 조용히
 * 사라진다. 상한에 걸린 지역은 맵에 없고 → getRegionSnapshot() 이 null →
 * /region/[id] 가 404 다. **행을 안 자르는 게 이 함수의 정의**이므로, 상한은
 * 자르기 위한 게 아니라 폭주를 막기 위해 도메인 최대치보다 한참 위에 둔다.
 *
 * 도메인 최대치: 시군구 단위 265개 × 출처 3(reb/kb/crawl) ≈ 800행.
 * 오늘 실측은 61행이다. 2,000 은 그 위이므로 정상 운영에서는 절대 안 닿고,
 * 닿았다면 그건 적재 이상(중복 적재·period 누적)이라는 신호다 —
 * 그래서 닿는 순간 **조용히 자르지 않고 경고를 남긴다**. 잘린 걸 모르는 게
 * 안 자르는 것보다 나쁘다.
 */
const SNAPSHOT_HARD_LIMIT = 2000;

/** 모든 지역의 최신 스냅샷 맵 (REB 우선, 없으면 KB). 1h 캐시. */
export async function getAllRegionSnapshots(): Promise<Map<string, RegionMarketSnapshot>> {
  if (snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) return snapshotCache.map;
  const map = new Map<string, RegionMarketSnapshot>();
  const sb = getServiceSupabase();
  if (!sb) {
    /* 키 부재도 캐시하지 않는다 — 2026-08-04 소유자 캡처: 홈 "지역 시세를
       아직 불러오지 못했어요" + 미니지도 마커 전멸이 1시간 단위로 굳어
       있었다. 빈 성공을 캐시하면 일시 결함이 1시간짜리 "시세 없음"이 된다. */
    return map;
  }
  const { data, error } = await sb
    .from("market_region_price")
    .select(
      "source,region_id,region_name,period,per_m2_sale,avg_sale,median_sale,jeonse_ratio,sale_change,trade_count,buy_superiority,jeonse_supply",
    )
    .eq("property_type", "apt")
    .limit(SNAPSHOT_HARD_LIMIT);
  /* 실패는 캐시하지 않는다. 예전에는 여기서 빈 맵을 캐시했고, 그 결과
     getRegionSnapshot() 이 null → /region/[id] 가 404 를 한 시간 동안 냈다. */
  if (error || !data) throwQueryFailure("market_region_price", error);
  /* 0행 "성공"도 캐시하지 않는다 — 운영에서 이 표가 정말로 비는 경우는
     ETL 재적재 창뿐이다. 그 순간을 1시간 캐시하면 위 캡처 증상이 된다.
     빈 맵은 이번 요청에만 쓰고 다음 요청이 다시 읽게 둔다. */
  if (data.length === 0) {
    logger.warn(
      "[market/store] market_region_price 0행 — ETL 재적재 창일 수 있어 캐시하지 않음",
    );
    return map;
  }
  /* 상한에 닿았다 = 잘렸을 수 있다. 조용히 지나가면 "그 지역은 원래 없다"로
     읽히고, 그게 404 로 나간다. 소리를 내고, 이번 결과는 캐시하지 않는다 —
     잘린 맵을 1시간 붙들면 그 시간 내내 없는 지역이 된다.
     (맵 자체는 아래에서 그대로 만든다. 있는 만큼은 보여 주는 게 낫다.) */
  const maybeTruncated = data.length >= SNAPSHOT_HARD_LIMIT;
  if (maybeTruncated) {
    logger.error(
      `[market/store] market_region_price 가 안전 상한(${SNAPSHOT_HARD_LIMIT}행)에 닿았습니다 — ` +
        "지역이 잘렸을 수 있어 이번 결과를 캐시하지 않습니다. 적재 중복 여부를 확인하세요.",
    );
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
  if (!maybeTruncated) snapshotCache = { at: Date.now(), map };
  return map;
}

export async function getRegionSnapshot(regionId: string): Promise<RegionMarketSnapshot | null> {
  /* 따뜻한 캐시가 있으면 그걸 쓴다 — 없다고 전량 스캔을 내지는 않는다.
     예전엔 단일 지역 조회도 getAllRegionSnapshots() 를 불러 12개 컬럼 전량
     테이블 스캔을 냈다(콜드 람다마다). 단일 지역은 region_id 등치 + limit 로
     인덱스를 태우고, 벌크 로드는 지도/추천 같은 전지역 소비자만 낸다. */
  if (snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) {
    return snapshotCache.map.get(regionId) ?? null;
  }
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("market_region_price")
    .select(
      "source,region_id,region_name,period,per_m2_sale,avg_sale,median_sale,jeonse_ratio,sale_change,trade_count,buy_superiority,jeonse_supply",
    )
    .eq("property_type", "apt")
    .eq("region_id", regionId)
    .limit(10);
  if (error || !data) throwQueryFailure("market_region_price", error);
  const priority: Record<string, number> = { reb: 2, kb: 1, crawl: 0 };
  let best: RegionMarketSnapshot | null = null;
  let bestPriority = -1;
  for (const row of data) {
    const src = String(row.source);
    const p = priority[src] ?? 0;
    if (p <= bestPriority) continue;
    bestPriority = p;
    best = {
      regionId: String(row.region_id),
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
    };
  }
  return best;
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
  /** 곁다리 예산 신호 (항목 25) — 예산이 접히면 PostgREST 요청도 끊는다. */
  signal?: AbortSignal,
): Promise<Array<{ period: string; value: number }>> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  let q = sb
    .from("market_region_series")
    .select("period,value,source")
    .eq("region_id", regionId)
    .eq("property_type", "apt")
    .eq("metric", metric)
    .eq("period_type", periodType)
    .order("period", { ascending: false })
    .limit(limit);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error || !data) throwQueryFailure(`market_region_series(${regionId}/${metric})`, error);
  return data
    .map((r) => ({ period: String(r.period), value: Number(r.value) }))
    .reverse();
}

/* ---------- 지역 최근 실거래 (market_transactions 읽기 전용) ---------- */

export interface RegionTransactionRow {
  complexName: string;
  address: string | null;
  /** yyyymm */
  contractYm: string;
  contractDay: number | null;
  dealAmountKrw: number;
  areaM2: number | null;
  floor: number | null;
}

/**
 * market_transactions.region_name 표기("서울 강남구"·"고양 덕양구"·"과천시")와
 * market_region_price.region_name 표기("강남구"·"고양시 덕양구")를 잇는 후보 목록.
 */
export function transactionNameCandidates(regionId: string, regionName: string): string[] {
  const name = regionName.trim();
  const out = new Set<string>([name]);
  if (name.includes(" ")) {
    // "고양시 덕양구" → "고양 덕양구", "수원시 영통구" → "수원 영통구"
    out.add(name.replace("시 ", " "));
  } else if (name.endsWith("구")) {
    out.add(regionId.startsWith("incheon-") ? `인천 ${name}` : `서울 ${name}`);
  }
  return [...out];
}

/**
 * 지역 최근 아파트 매매 실거래 (계약일 내림차순).
 *
 * 빈 배열은 "그 지역에 수집된 매매 실거래가 없다"만 뜻한다. 조회가 실패하면
 * 던진다 — 예전처럼 빈 배열로 뭉개면 화면이 "거래가 없는 동네"라고 거짓말한다.
 */
export async function listRegionTransactions(
  regionId: string,
  regionName: string,
  limit = 5,
  /** 곁다리 예산 신호 (항목 25) */
  signal?: AbortSignal,
): Promise<RegionTransactionRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  let q = sb
    .from("market_transactions")
    .select("complex_name,address,contract_ym,contract_day,deal_amount_krw,area_m2,floor")
    .in("region_name", transactionNameCandidates(regionId, regionName))
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .eq("property_type", "apartment")
    .not("deal_amount_krw", "is", null)
    .order("contract_ym", { ascending: false })
    .order("contract_day", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error || !data) throwQueryFailure(`market_transactions(${regionId})`, error);
  return data.map((r) => ({
    complexName: String(r.complex_name ?? "단지명 미상"),
    address: r.address ? String(r.address) : null,
    contractYm: String(r.contract_ym ?? ""),
    contractDay: r.contract_day === null ? null : Number(r.contract_day),
    dealAmountKrw: Number(r.deal_amount_krw),
    areaM2: r.area_m2 === null ? null : Number(r.area_m2),
    floor: r.floor === null ? null : Number(r.floor),
  }));
}

/* ---------- 지역 월별 거래량 (market_region_monthly 읽기 전용) ---------- */

export interface RegionMonthlyVolumeRow {
  /** yyyymm */
  month: string;
  count: number;
  avgDealAmountKrw: number | null;
}

/**
 * 지역 월별 아파트 매매 거래량·평균가 (오름차순).
 * `market_region_monthly` 집계 테이블(실거래 기반)에서 읽는다 — 타이밍 화면의
 * "거래량 신호"가 지어낸 숫자가 아니라 이 실측치에서 계산되게 하기 위한 헬퍼.
 * 주의: 최신 1~2개월은 신고 지연으로 실제보다 적게 잡힐 수 있다(화면에 명기할 것).
 */
export async function getRegionMonthlyVolume(
  regionId: string,
  regionName: string,
  limit = 8,
  /** 곁다리 예산 신호 (항목 25) */
  signal?: AbortSignal,
): Promise<RegionMonthlyVolumeRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  let q = sb
    .from("market_region_monthly")
    .select("month, transaction_count, avg_deal_amount_krw, region_name")
    .in("region_name", transactionNameCandidates(regionId, regionName))
    .eq("deal_type", "trade")
    .eq("property_type", "apartment")
    .order("month", { ascending: false })
    .limit(limit);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error || !data) throwQueryFailure(`market_region_monthly(${regionId})`, error);
  // 같은 월에 표기 다른 후보명이 겹치면 건수 합산
  const byMonth = new Map<string, RegionMonthlyVolumeRow>();
  for (const r of data) {
    const month = String(r.month ?? "");
    if (!/^\d{6}$/.test(month)) continue;
    const prev = byMonth.get(month);
    const count = Number(r.transaction_count ?? 0);
    const avg = r.avg_deal_amount_krw === null ? null : Number(r.avg_deal_amount_krw);
    if (!prev) byMonth.set(month, { month, count, avgDealAmountKrw: avg });
    else {
      prev.count += count;
      if (prev.avgDealAmountKrw === null) prev.avgDealAmountKrw = avg;
    }
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}
