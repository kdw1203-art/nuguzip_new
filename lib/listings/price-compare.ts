/**
 * 매물 호가 ↔ 국토부 실거래가 비교 (서버 전용).
 * 같은 단지·같은 면적대의 최근 실거래(매매) 중위가와 매물 호가를 견줘
 * "최근 실거래 대비 -8% / +3%" 를 계산한다.
 * 실거래(market_transactions)는 매매(trade)만 로드되므로 매매 매물에 한해 비교한다.
 * 데이터 미설정·부족 시 graceful 하게 null / 빈 배열 반환.
 */
import {
  listComplexTransactions,
  type ComplexTxRegion,
  type ComplexTransactionRecord,
} from "@/lib/market/complex-transactions";
import { SEOUL_DISTRICTS, METRO_EXPLORE_DISTRICTS } from "@/lib/map/seoul-districts";
import type { ListingType } from "@/lib/listings/store-db";

/* ---------- 지역 표기 → ComplexTxRegion 해석 ---------- */

const ALL_TX_REGIONS: ComplexTxRegion[] = [
  ...SEOUL_DISTRICTS.map((d) => ({ id: d.id, name: d.name, city: d.city ?? "서울" })),
  ...METRO_EXPLORE_DISTRICTS.map((d) => ({ id: d.id, name: d.name, city: d.city ?? "서울" })),
];

/**
 * 매물 region_name("강남구"·"서울 강남구"·"고양 덕양구" 등)을 내부 표기 지역으로 해석.
 * 확신이 없으면 null(비교 생략) — 오매칭 방지.
 */
export function resolveTxRegionByName(regionName: string | null): ComplexTxRegion | null {
  const raw = regionName?.trim();
  if (!raw) return null;

  const candidates = new Set<string>([raw]);
  // 시/도 접두 제거: "서울 강남구" → "강남구"
  const noCity = raw.replace(/^(서울|인천|경기|서울특별시|인천광역시|경기도)\s+/, "").trim();
  if (noCity) candidates.add(noCity);
  // "고양 덕양구" → "고양시 덕양구"
  const spaced = noCity.match(/^(\S+?)\s+(\S+구)$/);
  if (spaced && !spaced[1].endsWith("시")) candidates.add(`${spaced[1]}시 ${spaced[2]}`);

  for (const c of candidates) {
    const hit = ALL_TX_REGIONS.find((r) => r.name === c);
    if (hit) return hit;
  }
  // 마지막 자치구 토큰만으로 보수적 매칭 (예: "성남시 분당구" → "분당구")
  const lastToken = noCity.split(/\s+/).pop() ?? "";
  if (lastToken.endsWith("구")) {
    const hit = ALL_TX_REGIONS.find((r) => r.name === lastToken);
    if (hit) return hit;
  }
  return null;
}

/* ---------- 면적대 매칭 ---------- */

/** listing 면적 a 기준 ±10%(최소 ±3㎡) 밴드 안이면 같은 면적대로 본다. */
export function isSameAreaBand(a: number | null, b: number | null): boolean {
  if (a === null || b === null || a <= 0 || b <= 0) return false;
  return Math.abs(a - b) <= Math.max(3, a * 0.1);
}

/** 오늘 기준 (monthsBack-1)개월 전 yyyymm (해당 월 포함) */
function recentCutoffYm(monthsBack = 12): string {
  const d = new Date();
  d.setMonth(d.getMonth() - (monthsBack - 1));
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ---------- 비교 대상 실거래 로드 ---------- */

/**
 * 같은 단지·면적대의 최근 실거래(매매) — 최신순.
 * 면적대 표본이 없으면 단지 전체, 최근 12개월 표본이 없으면 최신 표본으로 폴백.
 */
export async function getComparableTransactions(input: {
  complexName: string;
  regionName: string | null;
  areaM2: number | null;
}): Promise<ComplexTransactionRecord[]> {
  const name = input.complexName?.trim();
  const region = resolveTxRegionByName(input.regionName);
  if (!name || !region) return [];

  let rows: ComplexTransactionRecord[];
  try {
    rows = await listComplexTransactions(name, region, 120);
  } catch {
    return [];
  }
  if (rows.length === 0) return [];

  const band =
    input.areaM2 !== null ? rows.filter((r) => isSameAreaBand(input.areaM2, r.areaM2)) : rows;
  const scoped = band.length > 0 ? band : rows;

  const cutoff = recentCutoffYm(12);
  const recent = scoped.filter((r) => r.contractYm >= cutoff);
  return (recent.length > 0 ? recent : scoped).slice(0, 12);
}

/* ---------- 호가 대비 시세 비교 ---------- */

export interface PriceCompareResult {
  /** 최근 실거래 중위가(원) */
  medianKrw: number;
  /** 호가 − 중위가 비율(%). 음수=시세 대비 저렴, 양수=비쌈 */
  deltaPct: number;
  /** 계산에 쓰인 실거래 표본 수 */
  sampleCount: number;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * 매물 호가와 같은 단지·면적대의 최근 실거래 중위가를 비교.
 * 매매(sale) 매물만 지원(실거래 로더가 매매만 제공) — 그 외/데이터 부족 시 null.
 */
export async function comparePriceToMarket(input: {
  complexName: string;
  regionName: string | null;
  areaM2: number | null;
  listingType: ListingType;
  priceKrw: number | null;
  depositKrw: number | null;
}): Promise<PriceCompareResult | null> {
  if (input.listingType !== "sale") return null;
  const asking = input.priceKrw;
  if (asking === null || !Number.isFinite(asking) || asking <= 0) return null;

  const rows = await getComparableTransactions(input);
  const amounts = rows.map((r) => r.dealAmountKrw).filter((n) => Number.isFinite(n) && n > 0);
  if (amounts.length === 0) return null;

  const medianKrw = median(amounts);
  if (medianKrw <= 0) return null;

  const deltaPct = Math.round(((asking - medianKrw) / medianKrw) * 100);
  return { medianKrw, deltaPct, sampleCount: amounts.length };
}
