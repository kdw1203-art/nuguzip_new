/**
 * 단지별 실거래 현황 — market_transactions 읽기 전용 로더 (서버 전용).
 * 국토부 실거래가 기반(매물 호가 아님). Supabase 미설정·조회 실패 시 빈 값 반환.
 * PostgREST 집계가 제한적이므로 구 단위 최근 N행을 가져와 JS에서 집계한다(~수만 행 규모라 충분).
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { SEOUL_DISTRICTS, METRO_EXPLORE_DISTRICTS } from "@/lib/map/seoul-districts";

/* ---------- 지역 매핑 ---------- */

export interface ComplexTxRegion {
  id: string;
  /** 내부 표기 — "강남구" · "고양시 덕양구" */
  name: string;
  /** "서울" | "경기" | "인천" ... */
  city: string;
}

const ALL_REGIONS: ComplexTxRegion[] = [
  ...SEOUL_DISTRICTS.map((d) => ({ id: d.id, name: d.name, city: d.city ?? "서울" })),
  ...METRO_EXPLORE_DISTRICTS.map((d) => ({ id: d.id, name: d.name, city: d.city ?? "서울" })),
];

export function findComplexTxRegionById(regionId: string): ComplexTxRegion | null {
  return ALL_REGIONS.find((r) => r.id === regionId) ?? null;
}

/** 강남4구 우선 정렬된 서울 25개 구 목록 (/complex/browse 칩용) */
export const SEOUL_BROWSE_REGIONS: ComplexTxRegion[] = (() => {
  const priority = ["gangnam", "seocho", "songpa", "gangdong"];
  const seoul = SEOUL_DISTRICTS.map((d) => ({ id: d.id, name: d.name, city: "서울" }));
  const first = priority
    .map((id) => seoul.find((r) => r.id === id))
    .filter((r): r is ComplexTxRegion => r !== undefined);
  const rest = seoul.filter((r) => !priority.includes(r.id));
  return [...first, ...rest];
})();

/**
 * market_transactions.region_name 표기("서울 강남구"·"고양 덕양구"·"과천시")와
 * 내부 표기("강남구"·"고양시 덕양구")를 잇는 후보 목록 (store.ts 규칙과 동일).
 */
export function transactionRegionCandidates(region: ComplexTxRegion): string[] {
  const name = region.name.trim();
  const out = new Set<string>([name]);
  if (name.includes(" ")) {
    // "고양시 덕양구" → "고양 덕양구"
    out.add(name.replace("시 ", " "));
  } else if (name.endsWith("구")) {
    out.add(`${region.city === "인천" ? "인천" : "서울"} ${name}`);
  }
  return [...out];
}

/** 표기 라벨 — "서울 강남구" · "고양시 덕양구" */
export function regionDisplayName(region: ComplexTxRegion): string {
  if (region.city === "서울") return `서울 ${region.name}`;
  return region.name.includes(" ") ? region.name : `${region.city} ${region.name}`;
}

/* ---------- slug (/complex/tx/[slug]) ---------- */

/** slug = encodeURIComponent(단지명) + "--" + regionId */
export function buildComplexTxSlug(complexName: string, regionId: string): string {
  return `${encodeURIComponent(complexName)}--${regionId}`;
}

export function parseComplexTxSlug(
  rawSlug: string,
): { complexName: string; regionId: string } | null {
  let slug = rawSlug;
  try {
    // Next dynamic param 은 percent-encoded 로 전달될 수 있음 — 1차 디코드
    slug = decodeURIComponent(rawSlug);
  } catch {
    /* 그대로 사용 */
  }
  const sep = slug.lastIndexOf("--");
  if (sep <= 0 || sep >= slug.length - 2) return null;
  let complexName = slug.slice(0, sep);
  const regionId = slug.slice(sep + 2);
  try {
    // buildComplexTxSlug 의 encodeURIComponent 복원 (이미 디코드된 경우 무해)
    complexName = decodeURIComponent(complexName);
  } catch {
    /* 그대로 사용 */
  }
  complexName = complexName.trim();
  if (!complexName || !/^[a-z0-9-]+$/.test(regionId)) return null;
  return { complexName, regionId };
}

/* ---------- 타입 ---------- */

export interface ComplexTransactionRecord {
  complexName: string;
  address: string | null;
  /** yyyymm */
  contractYm: string;
  contractDay: number | null;
  dealAmountKrw: number;
  areaM2: number | null;
  floor: number | null;
  buildYear: number | null;
  pricePerPyeongKrw: number | null;
}

export interface ComplexSummary {
  complexName: string;
  address: string | null;
  buildYear: number | null;
  /** 최근 거래월 yyyymm */
  latestYm: string;
  latestDay: number | null;
  /** 최근 거래가 (원) */
  latestAmountKrw: number;
  latestAreaM2: number | null;
  /** 최근 12개월 거래건수 (조회 표본 내) */
  txCount12m: number;
  /** 최근 12개월 평균 평단가 (원/평) */
  avgPricePerPyeongKrw: number | null;
  /** 대표(최빈) 전용면적 ㎡ */
  representativeAreaM2: number | null;
}

/* ---------- 캐시 (10분) ---------- */

const CACHE_TTL_MS = 10 * 60 * 1000;
const summaryCache = new Map<string, { at: number; data: ComplexSummary[] }>();
const txCache = new Map<string, { at: number; data: ComplexTransactionRecord[] }>();

function cacheGet<T>(map: Map<string, { at: number; data: T }>, key: string): T | null {
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  return null;
}

/* ---------- 내부 헬퍼 ---------- */

const TX_SELECT =
  "complex_name,address,contract_ym,contract_day,deal_amount_krw,area_m2,floor,build_year,price_per_pyeong_krw";

interface RawTxRow {
  complex_name: unknown;
  address: unknown;
  contract_ym: unknown;
  contract_day: unknown;
  deal_amount_krw: unknown;
  area_m2: unknown;
  floor: unknown;
  build_year: unknown;
  price_per_pyeong_krw: unknown;
}

function toRecord(r: RawTxRow): ComplexTransactionRecord | null {
  const amount = Number(r.deal_amount_krw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const name = r.complex_name ? String(r.complex_name).trim() : "";
  if (!name) return null;
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    complexName: name,
    address: r.address ? String(r.address) : null,
    contractYm: String(r.contract_ym ?? ""),
    contractDay: num(r.contract_day),
    dealAmountKrw: amount,
    areaM2: num(r.area_m2),
    floor: num(r.floor),
    buildYear: num(r.build_year),
    pricePerPyeongKrw: num(r.price_per_pyeong_krw),
  };
}

/** 오늘 기준 12개월 전 yyyymm (해당 월 포함) */
function twelveMonthsAgoYm(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 11);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** ㎡ → 평 환산 평단가 (price_per_pyeong_krw 없을 때 보정) */
function derivePerPyeong(rec: ComplexTransactionRecord): number | null {
  if (rec.pricePerPyeongKrw !== null && rec.pricePerPyeongKrw > 0) return rec.pricePerPyeongKrw;
  if (rec.areaM2 !== null && rec.areaM2 > 0) {
    return rec.dealAmountKrw / (rec.areaM2 / 3.3058);
  }
  return null;
}

/** 구 단위 최근 거래 원본 조회 (최신순, 최대 sampleLimit 행) */
async function fetchDistrictTransactions(
  region: ComplexTxRegion,
  sampleLimit: number,
): Promise<ComplexTransactionRecord[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("market_transactions")
      .select(TX_SELECT)
      .in("region_name", transactionRegionCandidates(region))
      .eq("transaction_type", "trade")
      .eq("property_type", "apartment")
      .not("deal_amount_krw", "is", null)
      .order("contract_ym", { ascending: false })
      .order("contract_day", { ascending: false, nullsFirst: false })
      .limit(sampleLimit);
    if (error || !data) {
      if (error) logger.warn("[complex-transactions] fetchDistrictTransactions", error.message);
      return [];
    }
    return (data as RawTxRow[])
      .map(toRecord)
      .filter((r): r is ComplexTransactionRecord => r !== null);
  } catch (e) {
    logger.warn("[complex-transactions] fetchDistrictTransactions", e);
    return [];
  }
}

/* ---------- 공개 로더 ---------- */

/**
 * 구 단위 단지 요약 — complex_name 그룹, 최신 거래순.
 * 최근 1,000건 표본 기반이라 활발한 구의 12개월 건수는 하한값이다.
 */
export async function listDistrictComplexSummaries(
  region: ComplexTxRegion,
  limit = 12,
): Promise<ComplexSummary[]> {
  const cacheKey = region.id;
  const cached = cacheGet(summaryCache, cacheKey);
  if (cached) return cached.slice(0, limit);

  const rows = await fetchDistrictTransactions(region, 1000);
  const cutoffYm = twelveMonthsAgoYm();

  interface Agg {
    latest: ComplexTransactionRecord;
    count12m: number;
    perPyeongSum: number;
    perPyeongN: number;
    areaFreq: Map<number, number>;
    address: string | null;
    buildYear: number | null;
  }
  const byName = new Map<string, Agg>();
  for (const rec of rows) {
    let agg = byName.get(rec.complexName);
    if (!agg) {
      agg = {
        latest: rec, // 최신순 정렬이므로 첫 행이 최근 거래
        count12m: 0,
        perPyeongSum: 0,
        perPyeongN: 0,
        areaFreq: new Map(),
        address: null,
        buildYear: null,
      };
      byName.set(rec.complexName, agg);
    }
    if (agg.address === null && rec.address) agg.address = rec.address;
    if (agg.buildYear === null && rec.buildYear !== null) agg.buildYear = rec.buildYear;
    if (rec.contractYm >= cutoffYm) {
      agg.count12m += 1;
      const pp = derivePerPyeong(rec);
      if (pp !== null) {
        agg.perPyeongSum += pp;
        agg.perPyeongN += 1;
      }
    }
    if (rec.areaM2 !== null) {
      const key = Math.round(rec.areaM2);
      agg.areaFreq.set(key, (agg.areaFreq.get(key) ?? 0) + 1);
    }
  }

  const summaries: ComplexSummary[] = [...byName.values()].map((agg) => {
    let repArea: number | null = null;
    let best = 0;
    for (const [area, n] of agg.areaFreq) {
      if (n > best) {
        best = n;
        repArea = area;
      }
    }
    return {
      complexName: agg.latest.complexName,
      address: agg.address,
      buildYear: agg.buildYear,
      latestYm: agg.latest.contractYm,
      latestDay: agg.latest.contractDay,
      latestAmountKrw: agg.latest.dealAmountKrw,
      latestAreaM2: agg.latest.areaM2,
      txCount12m: agg.count12m,
      avgPricePerPyeongKrw: agg.perPyeongN > 0 ? agg.perPyeongSum / agg.perPyeongN : null,
      representativeAreaM2: repArea,
    };
  });

  // 최신 거래순 (같은 월이면 일자·거래량 순)
  summaries.sort((a, b) => {
    if (a.latestYm !== b.latestYm) return a.latestYm < b.latestYm ? 1 : -1;
    const dayA = a.latestDay ?? 0;
    const dayB = b.latestDay ?? 0;
    if (dayA !== dayB) return dayB - dayA;
    return b.txCount12m - a.txCount12m;
  });

  summaryCache.set(cacheKey, { at: Date.now(), data: summaries });
  return summaries.slice(0, limit);
}

/** 특정 단지 거래 이력 (최신순, 기본 30건) */
export async function listComplexTransactions(
  complexName: string,
  region: ComplexTxRegion,
  limit = 30,
): Promise<ComplexTransactionRecord[]> {
  const cacheKey = `${region.id}|${complexName}`;
  const cached = cacheGet(txCache, cacheKey);
  if (cached) return cached.slice(0, limit);

  const sb = getServiceSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("market_transactions")
      .select(TX_SELECT)
      .eq("complex_name", complexName)
      .in("region_name", transactionRegionCandidates(region))
      .eq("transaction_type", "trade")
      .eq("property_type", "apartment")
      .not("deal_amount_krw", "is", null)
      .order("contract_ym", { ascending: false })
      .order("contract_day", { ascending: false, nullsFirst: false })
      .limit(Math.max(limit, 120)); // 면적대·월별 집계용 여유분 확보
    if (error || !data) {
      if (error) logger.warn("[complex-transactions] listComplexTransactions", error.message);
      return [];
    }
    const rows = (data as RawTxRow[])
      .map(toRecord)
      .filter((r): r is ComplexTransactionRecord => r !== null);
    txCache.set(cacheKey, { at: Date.now(), data: rows });
    return rows.slice(0, limit);
  } catch (e) {
    logger.warn("[complex-transactions] listComplexTransactions", e);
    return [];
  }
}

/* ---------- 단지 상세 파생 집계 ---------- */

export interface AreaBandSummary {
  /** "~59㎡" 등 라벨 */
  label: string;
  count: number;
  latestAmountKrw: number;
  latestYm: string;
  avgAmountKrw: number;
}

const AREA_BANDS: Array<{ label: string; min: number; max: number }> = [
  { label: "~59㎡", min: 0, max: 60 },
  { label: "60~85㎡", min: 60, max: 85.5 },
  { label: "85~102㎡", min: 85.5, max: 102 },
  { label: "102~135㎡", min: 102, max: 135 },
  { label: "135㎡~", min: 135, max: Infinity },
];

/** 면적대(59/84 등 구간)별 최근가·평균가 요약 */
export function summarizeAreaBands(rows: ComplexTransactionRecord[]): AreaBandSummary[] {
  const out: AreaBandSummary[] = [];
  for (const band of AREA_BANDS) {
    const inBand = rows.filter(
      (r) => r.areaM2 !== null && r.areaM2 >= band.min && r.areaM2 < band.max,
    );
    if (inBand.length === 0) continue;
    // rows 는 최신순 — 첫 행이 최근 거래
    const latest = inBand[0];
    const avg = inBand.reduce((s, r) => s + r.dealAmountKrw, 0) / inBand.length;
    out.push({
      label: band.label,
      count: inBand.length,
      latestAmountKrw: latest.dealAmountKrw,
      latestYm: latest.contractYm,
      avgAmountKrw: avg,
    });
  }
  return out;
}

export interface MonthlyTxPoint {
  /** yyyymm */
  ym: string;
  count: number;
  avgAmountKrw: number | null;
}

/** 최근 12개월 월별 거래량·평균가 (빈 달 포함, 오름차순) */
export function summarizeMonthly(rows: ComplexTransactionRecord[]): MonthlyTxPoint[] {
  const points: MonthlyTxPoint[] = [];
  const d = new Date();
  d.setMonth(d.getMonth() - 11);
  for (let i = 0; i < 12; i++) {
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    const inMonth = rows.filter((r) => r.contractYm === ym);
    points.push({
      ym,
      count: inMonth.length,
      avgAmountKrw:
        inMonth.length > 0
          ? inMonth.reduce((s, r) => s + r.dealAmountKrw, 0) / inMonth.length
          : null,
    });
    d.setMonth(d.getMonth() + 1);
  }
  return points;
}

/* ---------- apartment_complexes 매칭 (선택적 병합) ---------- */

export interface ApartmentComplexMatch {
  id: string;
  name: string;
  address: string | null;
}

/** apartment_complexes 에서 동일 단지명 매칭 (주소에 구 이름 포함 시 우선) */
export async function findApartmentComplexByName(
  complexName: string,
  region: ComplexTxRegion,
): Promise<ApartmentComplexMatch | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("apartment_complexes")
      .select("id,name,address")
      .eq("name", complexName)
      .limit(10);
    if (error || !data || data.length === 0) return null;
    const gu = region.name.trim().split(/\s+/).pop() ?? region.name;
    const rows = data.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      address: r.address ? String(r.address) : null,
    }));
    return rows.find((r) => r.address?.includes(gu)) ?? rows[0];
  } catch (e) {
    logger.warn("[complex-transactions] findApartmentComplexByName", e);
    return null;
  }
}
