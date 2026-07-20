import {
  SEOUL_DISTRICTS,
  METRO_EXPLORE_DISTRICTS,
} from "@/lib/map/seoul-districts";

/* ============================================================
   단지 지역 문자열 → 알려진 regionId 해석 (분석 도구 공용)
   - 단지 상세/검색이 주는 "안양시 동안구" · "서울특별시 강남구" 같은
     자유 표기를 시세 API가 쓰는 regionId(gangnam, anyang-dongan …)로 매핑.
   - 서버(타이밍 page)·클라이언트(ComplexPicker) 양쪽에서 import 가능하도록
     "use client" 없이 순수 모듈로 유지.
   ============================================================ */

export type RegionRef = { id: string; name: string; label: string };

const ALL_REGIONS: RegionRef[] = [
  ...SEOUL_DISTRICTS.map((d) => ({
    id: d.id,
    name: d.name,
    label: `서울 ${d.name}`,
  })),
  ...METRO_EXPLORE_DISTRICTS.map((d) => ({
    id: d.id,
    name: d.name,
    label: `${d.city ?? "서울"} ${d.name}`,
  })),
];

// 이름이 긴 항목 우선 매칭 ("성남시 분당구"가 "중구"보다 먼저 걸리도록)
const SORTED = [...ALL_REGIONS].sort((a, b) => b.name.length - a.name.length);

/** 지역 문자열을 알려진 regionId로 해석 (실패 시 null) */
export function resolveRegion(
  region: string | null | undefined,
): RegionRef | null {
  const r = (region ?? "").replace(/\s+/g, " ").trim();
  if (!r) return null;
  for (const d of SORTED) {
    if (r.includes(d.name)) return d;
  }
  return null;
}
