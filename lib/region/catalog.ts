// ─── 지역 마스터(SSOT) ────────────────────────────────────────
// 지역 식별·정규화의 단일 출처. 좌표·시세 시드는 seoul-districts 에 두고,
// 여기서는 "정규화 키"와 "카탈로그 조회"를 한 곳으로 모은다.
// explore-data(EXPLORE_REGIONS)·region-filter(검색)·ai/region-map(브릿지)가
// 모두 이 모듈의 normalizeRegionKey 를 공유하도록 한다.

import {
  METRO_EXPLORE_DISTRICTS,
  SEOUL_DISTRICTS,
  type SeoulDistrictInfo,
} from "@/lib/map/seoul-districts";

/** 서울 25구 + 수도권 권역을 합친 정식 지역 카탈로그. */
export const REGION_CATALOG: SeoulDistrictInfo[] = [
  ...SEOUL_DISTRICTS,
  ...METRO_EXPLORE_DISTRICTS,
];

/**
 * 지역명 정규화 키 — 공백·행정구역 접미사 제거 + 소문자화.
 * 검색 매칭·구 비교·카탈로그 조회의 단일 기준. (특별시/광역시/특별자치시/특별자치도)
 */
export function normalizeRegionKey(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/특별시|광역시|특별자치시|특별자치도/g, "")
    .toLowerCase();
}

const CATALOG_BY_KEY = new Map(
  REGION_CATALOG.map((info) => [normalizeRegionKey(info.name), info]),
);

const CATALOG_BY_ID = new Map(REGION_CATALOG.map((info) => [info.id, info]));

/** 구/시명으로 카탈로그 항목 조회 (정확 → 부분 일치). */
export function findCatalogRegionByName(
  query: string,
): SeoulDistrictInfo | undefined {
  const key = normalizeRegionKey(query.trim());
  if (!key) return undefined;
  const exact = CATALOG_BY_KEY.get(key);
  if (exact) return exact;
  return REGION_CATALOG.find((info) => {
    const k = normalizeRegionKey(info.name);
    return k.includes(key) || key.includes(k);
  });
}

/** 카탈로그 id로 조회. */
export function findCatalogRegionById(
  id: string,
): SeoulDistrictInfo | undefined {
  return CATALOG_BY_ID.get(id);
}

/** 구/시명 → 정식 지역 id. 매칭 실패 시 null. */
export function regionIdForName(query: string): string | null {
  return findCatalogRegionByName(query)?.id ?? null;
}
