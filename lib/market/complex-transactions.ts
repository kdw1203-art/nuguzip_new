/**
 * 단지별 실거래 현황 — market_transactions 읽기 전용 로더 (서버 전용).
 * 국토부 실거래가 기반(매물 호가 아님). Supabase 미설정·조회 실패 시 빈 값 반환.
 * PostgREST 집계가 제한적이므로 구 단위 최근 N행을 가져와 JS에서 집계한다(~수만 행 규모라 충분).
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { SEOUL_DISTRICTS, METRO_EXPLORE_DISTRICTS } from "@/lib/map/seoul-districts";
import { AREA_BANDS } from "@/lib/market/bands";
import { APT_MASTER_SOURCE_KEY } from "@/lib/complex/apartment-master";

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

/**
 * region_name → 내부 지역 역방향 맵. 후보 이름이 두 지역에 걸리면 **버린다**.
 *
 * 정방향(transactionRegionCandidates)은 한 지역이 여러 표기를 가질 수 있다는
 * 사실만 다루면 되지만, 역방향은 "이 표기는 어느 지역인가"를 단정해야 한다.
 * 단정할 수 없는 이름까지 아무 쪽으로 붙이면 한 지역의 페이지에 다른 지역
 * 데이터가 실린다 — 그래서 모호하면 null 이다(모르는 것을 아는 척하지 않는다).
 */
const REGION_BY_TX_NAME: Map<string, ComplexTxRegion | null> = (() => {
  const map = new Map<string, ComplexTxRegion | null>();
  for (const region of ALL_REGIONS) {
    for (const name of transactionRegionCandidates(region)) {
      if (map.has(name) && map.get(name)?.id !== region.id) map.set(name, null);
      else map.set(name, region);
    }
  }
  return map;
})();

/** market_transactions.region_name 표기로 내부 지역 찾기. 모호하거나 없으면 null. */
export function findComplexTxRegionByTransactionName(
  regionName: string,
): ComplexTxRegion | null {
  return REGION_BY_TX_NAME.get(regionName.trim()) ?? null;
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
  /** 이 거래 행의 market_transactions.region_name 원문 — 단지 허브 id 조립용 */
  regionName: string;
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
  /** 최근 거래 행의 region_name 원문 — /complex/{id} 링크 조립용(항목 41) */
  regionName: string;
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
/**
 * 거래 이력 캐시. `fetched` 는 **그때 서버에 요청한 행 수**다 — 캐시된 배열 길이가
 * 아니다. 둘을 헷갈리면 조용히 잘린 답을 준다:
 *   limit=30 으로 먼저 부르면 120행을 받아 캐시한다. 뒤이어 limit=400 으로 부르면
 *   예전 코드는 캐시 적중으로 판단해 120행만 돌려줬고, 호출부는 그게 전부인 줄 알고
 *   "최근 12개월 120건"이라 적었다(실제로는 236건).
 * 그래서 요청량이 캐시 때보다 크면 다시 받는다. 단, 지난번에 요청한 것보다 **적게**
 * 돌아왔다면 그게 이 단지의 전부이므로 재조회하지 않는다.
 */
const txCache = new Map<
  string,
  { at: number; fetched: number; data: ComplexTransactionRecord[] }
>();

function cacheGet<T>(map: Map<string, { at: number; data: T }>, key: string): T | null {
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  return null;
}

/* ---------- 내부 헬퍼 ---------- */

/* region_name 을 함께 읽는 이유(항목 41·42): 단지 허브 URL(/complex/{id})의
   name-id 는 encodeComplexId(region_name, complex_name) 인데, region_name 은
   같은 지역도 표기가 여럿이다("서울 강남구"·"강남구"…). 링크·canonical 을 만들
   때 후보 중 하나를 추측하면 죽는 링크가 된다 — 실제 행이 가진 표기를 그대로
   실어 나른다. */
const TX_SELECT =
  "complex_name,region_name,address,contract_ym,contract_day,deal_amount_krw,area_m2,floor,build_year,price_per_pyeong_krw";

interface RawTxRow {
  complex_name: unknown;
  region_name: unknown;
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
    regionName: r.region_name ? String(r.region_name).trim() : "",
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

/**
 * 구 단위 최근 거래 원본 조회 (최신순, 최대 sampleLimit 행).
 *
 * 조회가 실패하면 던진다. 예전에는 빈 배열을 돌려줬는데, 그러면 화면이
 * "이 지역의 단지별 실거래 데이터를 준비 중입니다"를 띄운다 — 데이터는 이미
 * 수십만 건 있는데 잠깐 못 읽었을 뿐인 상황에서 방문자와 크롤러 모두에게
 * 거짓을 말하는 문장이다. 빈 배열은 "정말로 거래가 없다"만 뜻하게 둔다.
 *
 * 서비스 키가 없는 경우(CI 프리렌더)는 장애가 아니므로 그대로 빈 배열이다.
 */
async function fetchDistrictTransactions(
  region: ComplexTxRegion,
  sampleLimit: number,
  /** 곁다리 예산 신호 (항목 25) — 예산이 접히면 PostgREST 요청도 끊는다. */
  signal?: AbortSignal,
): Promise<ComplexTransactionRecord[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  let q = sb
    .from("market_transactions")
    .select(TX_SELECT)
    .in("region_name", transactionRegionCandidates(region))
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .eq("property_type", "apartment")
    .not("deal_amount_krw", "is", null)
    .order("contract_ym", { ascending: false })
    .order("contract_day", { ascending: false, nullsFirst: false })
    .limit(sampleLimit);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error || !data) {
    throw new Error(
      `[complex-transactions] ${region.id} 실거래 조회 실패${error?.message ? `: ${error.message}` : ""}`,
    );
  }
  return (data as RawTxRow[])
    .map(toRecord)
    .filter((r): r is ComplexTransactionRecord => r !== null);
}

/* ---------- 공개 로더 ---------- */

/**
 * 구 단위 단지 요약 — complex_name 그룹, 최신 거래순.
 * 최근 1,000건 표본 기반이라 활발한 구의 12개월 건수는 하한값이다.
 */
export async function listDistrictComplexSummaries(
  region: ComplexTxRegion,
  limit = 12,
  /** 곁다리 예산 신호 (항목 25). 캐시 미스의 조회에만 적용된다 —
      중단되면 이번 호출만 실패하고 캐시는 오염되지 않는다. */
  signal?: AbortSignal,
): Promise<ComplexSummary[]> {
  const cacheKey = region.id;
  const cached = cacheGet(summaryCache, cacheKey);
  if (cached) return cached.slice(0, limit);

  const rows = await fetchDistrictTransactions(region, 1000, signal);
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
      regionName: agg.latest.regionName,
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
  const want = Math.max(limit, 120); // 면적대·월별 집계용 여유분 확보
  const hit = txCache.get(cacheKey);
  if (
    hit &&
    Date.now() - hit.at < CACHE_TTL_MS &&
    // 지난번에 이만큼 이상 요청했거나(= 충분히 담겨 있다),
    // 요청보다 적게 돌아왔거나(= 이 단지 거래는 그게 전부다)
    (hit.fetched >= want || hit.data.length < hit.fetched)
  ) {
    return hit.data.slice(0, limit);
  }

  /* 조회 실패는 "거래 없음"이 아니다. 예전에는 error 도 없는 키도 전부 [] 로
     삼켰다. 그러면 /complex/tx/[slug] 가 `transactions.length === 0` 가드에서
     notFound() 를 부르고, 메타데이터는 robots:{index:false,follow:false} 를
     붙였다 — DB 가 몇 초 밀린 것뿐인데 크롤러에게 "이 단지 페이지는 없어졌다"고
     확정 신고한 셈이다. 이제 못 읽으면 던진다. 호출부는 5xx 로 답하거나
     ("나중에 다시 오라") 자기 책임으로 catch 한다. 0건은 진짜 0건일 때만 나온다. */
  const sb = getServiceSupabase();
  if (!sb) {
    throw new Error(
      "market_transactions: Supabase 서비스 키가 없어 단지 실거래를 조회할 수 없습니다.",
    );
  }
  const { data, error } = await sb
    .from("market_transactions")
    .select(TX_SELECT)
    .eq("complex_name", complexName)
    .in("region_name", transactionRegionCandidates(region))
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .eq("property_type", "apartment")
    .not("deal_amount_krw", "is", null)
    .order("contract_ym", { ascending: false })
    .order("contract_day", { ascending: false, nullsFirst: false })
    .limit(want);
  if (error) {
    logger.error("[complex-transactions] listComplexTransactions 조회 실패", error.message);
    throw new Error(
      `market_transactions 조회 실패 (${complexName}): ${error.message ?? "알 수 없는 오류"}`,
    );
  }
  const rows = ((data ?? []) as RawTxRow[])
    .map(toRecord)
    .filter((r): r is ComplexTransactionRecord => r !== null);
  txCache.set(cacheKey, { at: Date.now(), fetched: want, data: rows });
  return rows.slice(0, limit);
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

/* 구간표는 lib/market/bands.ts 한 곳에만 둔다 — A5 에서 같은 배열이 여기와
   complex-store.ts 에 복사돼 있던 것을 합쳤다. 자세한 이유는 그 파일 주석 참고. */

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

/**
 * D7 — 실거래 단지명 ↔ apartment_complexes 대장 마스터 매칭.
 *
 * 이 함수가 돌려준 id 는 /complex/tx/[slug] 에서 거주민 후기 키(`apt:<id>`)가
 * 된다. 틀린 행을 고르면 서로 다른 단지의 후기가 한 통에 섞인다. 그래서
 * "이름이 같다" 만으로는 부족하고 아래 두 조건을 모두 강제한다.
 *
 * 1) source_key 스코프 — apartment_complexes 39,362행 중 17,704행(45%)은 단지가
 *    아니라 REB 이름 별칭·ID 레코드다(자세한 실측은 lib/complex/apartment-master.ts).
 *    별칭 행은 address 가 전부 빈 문자열이라 아래 지역 검증을 통과할 수 없는데,
 *    예전 코드는 `rows.find(주소에 구 포함) ?? rows[0]` 이라 검증에 떨어진 뒤에도
 *    `rows[0]` 폴백으로 선택될 수 있었다. 실거래 단지명과 정확히 일치하는 행이
 *    별칭밖에 없는 (지역,단지) 쌍이 679개다.
 *
 * 2) 주소에 시군구 포함 — 동명이지가 실제로 많다. 이름이 정확히 일치하는 마스터가
 *    있는 1,901쌍 중 676쌍은 그 마스터가 **다른 지역** 단지다. 예: "고양 덕양구
 *    한라비발디" 의 동명 마스터는 원주·남양주·안양·의정부·김해·대전 서구·부산진구·
 *    목포에 있고 덕양구에는 없다. 예전 코드는 그 경우 원주 한라비발디의 id 를
 *    돌려줬고, 그러면 덕양구·원주·목포 후기가 전부 같은 키로 합쳐진다.
 *
 * 지역 검증을 통과하는 마스터가 없으면 null 을 돌려준다. 호출부는 그때
 * `tx:<regionId>:<단지명>` 이라는 지역 스코프 키로 폴백하니, 억지 매칭보다
 * 미매칭이 언제나 안전하다. 2,580쌍 중 지역까지 확인되는 건 1,225쌍이고
 * 나머지 1,355쌍이 지금까지 잘못된 id 를 받아왔다.
 * (수정 시점 complex_reviews 0행 — 이미 쌓인 후기가 없어 마이그레이션 부담 없음.)
 *
 * order("id") 는 취향이 아니라 필수다. ORDER BY 없는 결과 순서는 보장되지 않는데
 * 여기서 고른 행의 id 가 곧 저장 키라, 순서가 흔들리면 같은 단지의 후기가 요청마다
 * 다른 키로 갈린다. 같은 시군구에 동명 마스터가 2개인 쌍은 3개뿐(최대 2개)이라
 * 결정적으로 첫 행을 쓰면 충분하다.
 */
export async function findApartmentComplexByName(
  complexName: string,
  region: ComplexTxRegion,
): Promise<ApartmentComplexMatch | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  // "고양시 덕양구" → "덕양구" · "강남구" → "강남구". region.name 은 내부 상수라
  // 와일드카드가 들어올 일이 없지만, ilike 패턴에 넣으므로 방어적으로 제거한다.
  const gu = (region.name.trim().split(/\s+/).pop() ?? region.name).replace(/[%_]/g, "");
  if (!gu) return null;
  try {
    const { data, error } = await sb
      .from("apartment_complexes")
      .select("id,name,address")
      .eq("name", complexName)
      .eq("source_key", APT_MASTER_SOURCE_KEY)
      .ilike("address", `%${gu}%`)
      .order("id", { ascending: true })
      .limit(10);
    if (error || !data || data.length === 0) return null;
    const r = data[0];
    return {
      id: String(r.id),
      name: String(r.name),
      address: r.address ? String(r.address) : null,
    };
  } catch (e) {
    logger.warn("[complex-transactions] findApartmentComplexByName", e);
    return null;
  }
}
