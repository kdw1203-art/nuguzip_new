/**
 * AI 워크벤치 지역 ID ↔ 탐색/지도 지역 매핑 유틸 (공용).
 *
 * - 워크벤치(`DISTRICT_OPTIONS`)는 짧은 id(`gangnam`)와 라벨(`강남구`)을 쓴다.
 * - 탐색/지도(`EXPLORE_REGIONS`)도 카탈로그(seoul-districts) id(`gangnam`)와 라벨(`강남구`)을 공유한다.
 * 지도에서 고른 지역을 AI 도구 입력(regionDistrictId 등)으로 연결할 때 사용. 매칭은 라벨 기준.
 */

import { DISTRICT_OPTIONS } from "@/lib/ai/workbench-constants";

/** 라벨(강남구) → 워크벤치 district id(gangnam). 매칭 실패 시 null. */
export function workbenchDistrictIdFromLabel(label: string): string | null {
  const key = label.replace(/\s/g, "").trim();
  if (!key) return null;
  const exact = DISTRICT_OPTIONS.find((d) => d.label === key);
  if (exact) return exact.id;
  const loose = DISTRICT_OPTIONS.find(
    (d) => key.includes(d.label) || d.label.includes(key),
  );
  return loose?.id ?? null;
}

/** 워크벤치 district id → 라벨. 매칭 실패 시 null. */
export function workbenchLabelFromId(id: string): string | null {
  return DISTRICT_OPTIONS.find((d) => d.id === id)?.label ?? null;
}

export type AiRegionSelection = {
  /** 워크벤치 district id (매칭 실패 시 null) */
  districtId: string | null;
  /** 표시·자유입력용 라벨(강남구) */
  label: string;
  /** 탐색/카탈로그 지역 id(gangnam) */
  regionId: string;
  lat: number;
  lng: number;
};
