import { getBackendMode, type DataEnvelope, type LocationRef } from "./types";
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
  series: WeeklyPricePoint[];
  latestChangePct: number;
  threeMonthChangePct: number;
  trend: "up" | "flat" | "down";
};

function mockWeeklyPrices(location: LocationRef): WeeklyPriceSummary {
  const seed = `${location.city}${location.district ?? ""}`.length;
  const weeks = 12;
  const series: WeeklyPricePoint[] = [];
  let cumulative = 0;
  const today = new Date();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    const delta = Math.round(((seed + i) % 7) - 3) / 10; // -0.3 ~ +0.3
    cumulative += delta;
    series.push({
      weekStart: d.toISOString().slice(0, 10),
      changePct: Math.round(delta * 100) / 100,
      transactions: 140 + ((seed + i) % 40),
    });
  }
  const latest = series[series.length - 1].changePct;
  return {
    location,
    series,
    latestChangePct: latest,
    threeMonthChangePct: Math.round(cumulative * 100) / 100,
    trend: latest > 0.05 ? "up" : latest < -0.05 ? "down" : "flat",
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
  const mode = getBackendMode();
  const reb = await rebWeeklyPrices(location).catch(() => null);
  return {
    source: "reb-weekly-prices",
    sourceLabel: "한국부동산원 주간동향",
    unit: "PERCENT",
    viz: "line_chart",
    updatedAt: new Date().toISOString().slice(0, 10),
    mode: reb ? "live" : mode,
    attribution: "한국부동산원 주간아파트가격동향",
    isLocationBased: true,
    data: reb ?? mockWeeklyPrices(location),
  };
}
