/**
 * 매물 인사이트(동향·관심도·금리) 샘플 — 결정적 생성.
 *
 * 네이버부동산식 "매물동향 / 인기급상승 / 요즘 관심 아파트 / 주담대 금리" 위젯용.
 * 조회수·관심도는 complexId 시드로 결정적 산출(SSR/CSR 동일).
 * 실데이터 전환 시: 조회/북마크 집계는 실제 이벤트 로그로, 금리는 제휴/공시 API로 교체.
 */
import type { Listing, TradeType } from "@/lib/listings/sample-data";
import type { ComplexMarker } from "@/lib/listings/filter";

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 스코프(지역) 문자열 기반 결정적 부호 있는 변동률(%) */
export function seededSignedPct(scope: string, salt = 0): number {
  const rng = mulberry32(hashStr(`pct:${scope}:${salt}`));
  return Math.round((rng() * 5 - 1.5) * 10) / 10; // -1.5 ~ +3.5%
}

export interface ComplexInsight {
  /** 30일 조회수 */
  viewCount: number;
  /** 조회수 전주 대비 변동률(%) — 인기급상승 정렬 기준 */
  viewChangePct: number;
  /** 관심(북마크) 수 */
  bookmarkCount: number;
}

/** 실데이터 참여 지표(조회수·관심) — 있으면 샘플 위에 덮어쓴다. */
export interface EngagementCounts {
  viewCount: number;
  bookmarkCount: number;
}
export type EngagementMap = Map<string, EngagementCounts>;

export function complexInsight(complexId: string, real?: EngagementCounts): ComplexInsight {
  const rng = mulberry32(hashStr(`insight:${complexId}`));
  const sample: ComplexInsight = {
    viewCount: 200 + Math.floor(rng() * 9800),
    viewChangePct: Math.round((rng() * 65 - 12) * 10) / 10, // -12 ~ +53%
    bookmarkCount: Math.floor(rng() * 1400),
  };
  // 실데이터가 0보다 크면 우선 사용(없으면 샘플 베이스라인 유지로 UI 공백 방지).
  return {
    viewCount: real && real.viewCount > 0 ? real.viewCount : sample.viewCount,
    viewChangePct: sample.viewChangePct,
    bookmarkCount: real && real.bookmarkCount > 0 ? real.bookmarkCount : sample.bookmarkCount,
  };
}

export interface RankedComplex {
  complex: ComplexMarker;
  insight: ComplexInsight;
}

function rank(complexes: ComplexMarker[], engagement?: EngagementMap): RankedComplex[] {
  return complexes.map((c) => ({
    complex: c,
    insight: complexInsight(c.complexId, engagement?.get(c.complexId)),
  }));
}

/** 인기 급상승 — 조회수 증가율 상위 */
export function topRisingComplexes(
  complexes: ComplexMarker[],
  n = 5,
  engagement?: EngagementMap,
): RankedComplex[] {
  return rank(complexes, engagement)
    .filter((r) => r.insight.viewChangePct > 0)
    .sort((a, b) => b.insight.viewChangePct - a.insight.viewChangePct)
    .slice(0, n);
}

/** 요즘 관심 아파트 — 조회수 상위 */
export function topInterestComplexes(
  complexes: ComplexMarker[],
  n = 5,
  engagement?: EngagementMap,
): RankedComplex[] {
  return rank(complexes, engagement)
    .sort((a, b) => b.insight.viewCount - a.insight.viewCount)
    .slice(0, n);
}

export interface ListingTrend {
  total: number;
  byType: Record<TradeType, number>;
  /** 최근 30일 신규 매물 (추정) */
  newListings: number;
  /** 평균가 전월 대비 변동률(%) */
  avgPriceChangePct: number;
  /** 매매 평균가(원) */
  avgSaleKrw: number;
}

export function listingTrend(listings: Listing[], scope: string): ListingTrend {
  const byType: Record<TradeType, number> = { 매매: 0, 전세: 0, 월세: 0 };
  let saleSum = 0;
  let saleCount = 0;
  for (const l of listings) {
    byType[l.tradeType] += 1;
    if (l.tradeType === "매매") {
      saleSum += l.priceKrw;
      saleCount += 1;
    }
  }
  return {
    total: listings.length,
    byType,
    newListings: Math.round(listings.length * 0.18),
    avgPriceChangePct: seededSignedPct(scope, 7),
    avgSaleKrw: saleCount ? Math.round(saleSum / saleCount) : 0,
  };
}

export interface MortgageRate {
  bank: string;
  variable: string;
  fixed: string;
  note: string;
}

/** 주택담보대출 금리 비교 (예시 — 공시/제휴 API 연동 전 샘플) */
export const MORTGAGE_RATES: MortgageRate[] = [
  { bank: "케이뱅크", variable: "3.62~5.13%", fixed: "3.48~4.79%", note: "비대면 전용" },
  { bank: "카카오뱅크", variable: "3.71~5.02%", fixed: "3.55~4.66%", note: "중도상환 면제" },
  { bank: "KB국민", variable: "3.94~5.34%", fixed: "3.79~5.19%", note: "주거래 우대" },
  { bank: "신한", variable: "3.98~5.28%", fixed: "3.83~5.11%", note: "급여이체 우대" },
  { bank: "하나", variable: "4.01~5.31%", fixed: "3.88~5.18%", note: "전자약정 우대" },
];
