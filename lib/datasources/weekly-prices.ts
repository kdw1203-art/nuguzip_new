import type { DataEnvelope, LocationRef } from "./types";
import { getRegionSeries } from "@/lib/market/store";
import { matchRegionByName } from "@/lib/market/region-code";

/**
 * 한국부동산원 주간아파트가격동향.
 * 공식: https://www.reb.or.kr/
 */

export type WeeklyPricePoint = {
  weekStart: string; // YYYY-MM-DD
  changePct: number;
  transactions: number;
};

export type WeeklyPriceSummary = {
  location: LocationRef;
  /** 빈 배열 + null 지표는 "받지 못했다"는 뜻이다 — 0%("변동 없음")와 다르다. */
  series: WeeklyPricePoint[];
  latestChangePct: number | null;
  threeMonthChangePct: number | null;
  trend: "up" | "flat" | "down" | null;
};

/* 사실 우선: 여기 있던 mockWeeklyPrices() 를 삭제했다.
   지역명 길이를 시드로 12주치 주간 변동률(-0.3~+0.3%)과 거래량 140~180건을
   만들어 냈고, attribution 은 "한국부동산원 주간아파트가격동향"이었다 —
   집계된 적 없는 시세 흐름을 정부 통계 이름표로 보여주는 값이다.
   REB 실데이터(rebWeeklyPrices)를 받지 못하면 "모른다"로 답한다. */
function unavailableWeeklyPrices(location: LocationRef): WeeklyPriceSummary {
  return {
    location,
    series: [],
    latestChangePct: null,
    threeMonthChangePct: null,
    trend: null,
  };
}

/** REB 주간 매매지수 시계열 → 주간 변동률 요약. 데이터 없으면 null. */
async function rebWeeklyPrices(location: LocationRef): Promise<WeeklyPriceSummary | null> {
  const name = location.district ?? location.city ?? "";
  if (!name) return null;
  const match = matchRegionByName(name, location.city);
  if (!match) return null;
  const idx = await getRegionSeries(match.id, "sale_index", "weekly", 16).catch(() => []);
  if (idx.length < 2) return null;

  const series: WeeklyPricePoint[] = [];
  for (let i = 1; i < idx.length; i += 1) {
    const prev = idx[i - 1].value;
    const cur = idx[i].value;
    const changePct = prev ? Math.round(((cur - prev) / prev) * 10000) / 100 : 0;
    series.push({ weekStart: idx[i].period, changePct, transactions: 0 });
  }
  const latest = series[series.length - 1]?.changePct ?? 0;
  const threeMonthChangePct =
    Math.round(series.slice(-12).reduce((a, b) => a + b.changePct, 0) * 100) / 100;
  return {
    location,
    series,
    latestChangePct: latest,
    threeMonthChangePct,
    trend: latest > 0.02 ? "up" : latest < -0.02 ? "down" : "flat",
  };
}

export async function getWeeklyPriceSummary(
  location: LocationRef,
): Promise<DataEnvelope<WeeklyPriceSummary>> {
  const reb = await rebWeeklyPrices(location).catch(() => null);
  if (reb) {
    return {
      source: "reb-weekly-prices",
      sourceLabel: "한국부동산원 주간동향",
      unit: "PERCENT",
      viz: "line_chart",
      updatedAt: new Date().toISOString().slice(0, 10),
      mode: "live",
      attribution: "한국부동산원 주간아파트가격동향",
      isLocationBased: true,
      data: reb,
    };
  }
  /* 실데이터를 못 받았다 — 정부 출처 표기를 달지 않는다(그 데이터가 아니므로).
     지역 매칭 실패·시계열 부족·조회 실패가 모두 이 경로로 온다. */
  return {
    source: "reb-weekly-prices",
    sourceLabel: "주간동향 (미수신)",
    unit: "PERCENT",
    viz: "line_chart",
    updatedAt: new Date().toISOString().slice(0, 10),
    mode: "mock",
    attribution: "주간 시세 데이터를 불러오지 못했습니다",
    isLocationBased: true,
    data: unavailableWeeklyPrices(location),
  };
}
