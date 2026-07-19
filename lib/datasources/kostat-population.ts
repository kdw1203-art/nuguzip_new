import { getBackendMode, type DataEnvelope, type LocationRef } from "./types";

/**
 * 통계청 주민등록인구통계 (KOSIS).
 * 공식: https://kosis.kr/
 * API: https://kosis.kr/openapi/statisticsData.do (승인키 필요)
 */

export type AgeBracket = "0-9" | "10-19" | "20-29" | "30-39" | "40-49" | "50-59" | "60+";

export type PopulationSummary = {
  location: LocationRef;
  totalPopulation: number;
  households: number;
  personsPerHousehold: number;
  ageDistribution: Record<AgeBracket, number>;
  yearOverYearPct: number;
};

function mockPopulation(location: LocationRef): PopulationSummary {
  const seed = `${location.city}${location.district ?? ""}`.length;
  const total = 280_000 + (seed % 17) * 42_000;
  const households = Math.round(total / (2.3 + ((seed % 5) * 0.08)));
  const ratios: Record<AgeBracket, number> = {
    "0-9": 0.07 + ((seed % 3) * 0.002),
    "10-19": 0.09,
    "20-29": 0.14 + ((seed % 4) * 0.003),
    "30-39": 0.16,
    "40-49": 0.18,
    "50-59": 0.18,
    "60+": 0.18,
  };
  const ageDistribution = Object.fromEntries(
    Object.entries(ratios).map(([k, v]) => [k, Math.round(total * v)]),
  ) as Record<AgeBracket, number>;

  return {
    location,
    totalPopulation: total,
    households,
    personsPerHousehold: Math.round((total / households) * 100) / 100,
    ageDistribution,
    yearOverYearPct: Math.round(((seed % 7) - 3) * 0.18 * 100) / 100,
  };
}

export async function getPopulationSummary(
  location: LocationRef,
): Promise<DataEnvelope<PopulationSummary>> {
  const mode = getBackendMode();
  return {
    source: "kostat-population",
    sourceLabel: "통계청 인구통계",
    unit: "PEOPLE",
    viz: "bar_chart",
    updatedAt: new Date().toISOString().slice(0, 10),
    mode,
    attribution: "통계청 KOSIS · 주민등록인구현황",
    isLocationBased: true,
    data: mockPopulation(location),
  };
}
