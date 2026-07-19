// ─── 지역 탐색 필터링 엔진 (호갱노노·네이버부동산 스타일) ─────────────
// 검색어 매칭 + 가격대/등락/생활지표 패싯 필터를 한 곳에서 관리한다.
// 데스크톱·모바일 두 뷰가 동일 로직을 공유하도록 순수 함수로 구성.

import type { DemoRegion } from "./explore-data";
import { getDevelopmentStatus } from "./development-status";
import { normalizeRegionKey } from "./catalog";

/** 검색·구 비교용 정규화 — catalog 의 normalizeRegionKey 로 통합. */
export function normalizeRegionText(value: string): string {
  return normalizeRegionKey(value);
}

/**
 * 지역 검색 매칭 — 구 이름뿐 아니라 시/도, 대표 키워드, 인기 단지까지 폭넓게 매칭한다.
 * 예) "은마" → 강남구, "판교" → 분당, "신축" → 마포구
 */
export function matchRegionQuery(region: DemoRegion, query: string): boolean {
  const q = normalizeRegionText(query.trim());
  if (!q) return true;
  const haystacks = [
    region.district,
    region.city,
    region.popularComplex,
    ...region.topKeywords,
  ];
  return haystacks.some((h) => normalizeRegionText(h).includes(q));
}

/** 검색어 기준 상위 N개 자동완성 후보 (정확 일치 우선 → 부분 일치) */
export function suggestRegions(
  regions: DemoRegion[],
  query: string,
  limit = 6,
): DemoRegion[] {
  const q = normalizeRegionText(query.trim());
  if (!q) return [];
  const scored = regions
    .map((r) => {
      const dk = normalizeRegionText(r.district);
      let score = -1;
      if (dk === q) score = 100;
      else if (dk.startsWith(q)) score = 80;
      else if (dk.includes(q)) score = 60;
      else if (matchRegionQuery(r, query)) score = 30;
      return { r, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || b.r.avgPrice - a.r.avgPrice);
  return scored.slice(0, limit).map((x) => x.r);
}

// ─── 패싯 필터 ────────────────────────────────────────────────
export type PriceBandId = "all" | "under9" | "9to15" | "15to25" | "over25";
export type ChangeFilterId = "all" | "up" | "down" | "surge";
export type DevelopmentFilterId = "all" | "active" | "rebuild" | "transit";

export interface RegionFacets {
  priceBand: PriceBandId;
  change: ChangeFilterId;
  development: DevelopmentFilterId;
  schoolTop: boolean;
  transportGood: boolean;
  safetyTop: boolean;
}

export const DEFAULT_FACETS: RegionFacets = {
  priceBand: "all",
  change: "all",
  development: "all",
  schoolTop: false,
  transportGood: false,
  safetyTop: false,
};

export const PRICE_BANDS: Array<{
  id: PriceBandId;
  label: string;
  test?: (avgPrice: number) => boolean;
}> = [
  { id: "all", label: "전체" },
  { id: "under9", label: "9억 이하", test: (p) => p < 900_000_000 },
  { id: "9to15", label: "9~15억", test: (p) => p >= 900_000_000 && p < 1_500_000_000 },
  { id: "15to25", label: "15~25억", test: (p) => p >= 1_500_000_000 && p < 2_500_000_000 },
  { id: "over25", label: "25억+", test: (p) => p >= 2_500_000_000 },
];

export const CHANGE_FILTERS: Array<{ id: ChangeFilterId; label: string }> = [
  { id: "all", label: "전체" },
  { id: "up", label: "상승 ▲" },
  { id: "down", label: "하락 ▼" },
  { id: "surge", label: "급등 3%+" },
];

export const DEVELOPMENT_FILTERS: Array<{ id: DevelopmentFilterId; label: string }> = [
  { id: "all", label: "전체" },
  { id: "active", label: "개발 활발" },
  { id: "rebuild", label: "재건축·재개발" },
  { id: "transit", label: "교통호재·GTX" },
];

const SCHOOL_TOP_RANKS = new Set(["최상위", "상위", "중상"]);

/** 패싯 필터만 적용 (검색어·시/도·반경·정렬은 호출부에서 별도 처리) */
export function applyFacets(regions: DemoRegion[], f: RegionFacets): DemoRegion[] {
  const band = PRICE_BANDS.find((b) => b.id === f.priceBand);
  return regions.filter((r) => {
    if (band?.test && !band.test(r.avgPrice)) return false;
    if (f.change === "up" && r.priceChange <= 0) return false;
    if (f.change === "down" && r.priceChange >= 0) return false;
    if (f.change === "surge" && r.priceChange < 3) return false;
    if (f.schoolTop && !SCHOOL_TOP_RANKS.has(r.schoolRank)) return false;
    if (f.transportGood && r.transportScore < 90) return false;
    if (f.safetyTop && !r.safetyGrade.startsWith("A")) return false;
    if (f.development !== "all") {
      const dev = getDevelopmentStatus(r);
      if (f.development === "active" && dev.level !== "활발") return false;
      if (f.development === "rebuild" && !dev.tags.some((t) => t === "재건축" || t === "재개발"))
        return false;
      if (f.development === "transit" && !dev.tags.some((t) => t === "GTX" || t === "교통호재"))
        return false;
    }
    return true;
  });
}

/** 활성화된 패싯 수 — 필터 버튼 배지에 표시 */
export function activeFacetCount(f: RegionFacets): number {
  let n = 0;
  if (f.priceBand !== "all") n += 1;
  if (f.change !== "all") n += 1;
  if (f.development !== "all") n += 1;
  if (f.schoolTop) n += 1;
  if (f.transportGood) n += 1;
  if (f.safetyTop) n += 1;
  return n;
}
