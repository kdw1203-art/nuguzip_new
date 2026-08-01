import { getBackendMode, type DataEnvelope, type LocationRef } from "./types";

/**
 * 통계청 주민등록인구통계 (KOSIS).
 * 공식: https://kosis.kr/
 * API: https://kosis.kr/openapi/statisticsData.do (승인키 필요)
 *
 * KOSIS 클라이언트(lib/kosis/client.ts)는 있으나 이 어댑터와는 아직 연결돼
 * 있지 않다. 연결 전까지 이 모듈은 "모른다"를 그대로 돌려준다.
 */

export type AgeBracket = "0-9" | "10-19" | "20-29" | "30-39" | "40-49" | "50-59" | "60+";

export type PopulationSummary = {
  location: LocationRef;
  /** null 은 "집계를 받지 못했다" — 0("인구가 없다")과 다른 말이다. */
  totalPopulation: number | null;
  households: number | null;
  personsPerHousehold: number | null;
  /** 받지 못했으면 null. */
  ageDistribution: Record<AgeBracket, number> | null;
  yearOverYearPct: number | null;
};

/* 사실 우선: 여기 있던 mockPopulation() 을 삭제했다.
   지역명 길이를 시드로 "인구 32만 명 · 세대수 13만 · 전년 대비 +0.36%" 같은
   수치를 만들어 냈고, attribution 은 "통계청 KOSIS · 주민등록인구현황"이었다 —
   집계된 적 없는 인구를 정부 통계 이름표로 보여주는 값이다.
   실제 연동 전까지는 "모른다"로 답한다. */
function unavailablePopulation(location: LocationRef): PopulationSummary {
  return {
    location,
    totalPopulation: null,
    households: null,
    personsPerHousehold: null,
    ageDistribution: null,
    yearOverYearPct: null,
  };
}

export async function getPopulationSummary(
  location: LocationRef,
): Promise<DataEnvelope<PopulationSummary>> {
  const mode = getBackendMode();
  void mode; // KOSIS 어댑터가 이 모듈에 연결되기 전까지 live 경로가 없다.
  return {
    source: "kostat-population",
    sourceLabel: "인구통계 (미연동)",
    unit: "PEOPLE",
    viz: "bar_chart",
    updatedAt: new Date().toISOString().slice(0, 10),
    mode: "mock",
    attribution: "KOSIS 미연동 — 인구통계를 불러오지 못했습니다",
    isLocationBased: true,
    data: unavailablePopulation(location),
  };
}
