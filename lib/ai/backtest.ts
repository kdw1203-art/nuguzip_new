import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";

/* [AI-20] 예측 백테스트 — "우리 예측이 과거에 얼마나 맞았나"를 스스로 공개한다.
 *
 * 모델(공개): 3개월 모멘텀 외삽 — t-6~t-3 의 평당가 월평균 변화율을 t-3 시점에
 * 알 수 있는 정보로 계산해 t 의 평당가를 예측한다. 화려한 모델이 아니라
 * "예측 도구가 실제로 쓰는 것과 같은 단순 규칙"이고, 그 성적을 그대로 보여준다.
 * 판정: 실제값이 예측 ±5% 구간 안이면 적중. 표본 조건: 해당 월 거래 30건 이상.
 *
 * 이 수치는 매 조회 시 market_region_monthly 실데이터로 재계산된다(1h 캐시) —
 * 좋게 나오도록 고를 수 있는 손잡이(지역·기간 선별)를 만들지 않는다.
 */

export const BACKTEST = {
  hitBandPct: 5,
  minMonthlyTx: 30,
  lookbackMonths: 12,
} as const;

export interface BacktestCell {
  regionName: string;
  month: string; // 예측 대상 월 yyyymm
  predictedPerPyeong: number;
  actualPerPyeong: number;
  errorPct: number; // (actual-pred)/pred*100
  hit: boolean;
}

export interface BacktestSummary {
  cells: BacktestCell[];
  total: number;
  hits: number;
  hitRatePct: number | null;
  meanAbsErrorPct: number | null;
  monthsCovered: string[];
  computedAt: string;
}

interface Row {
  region_name: string;
  month: string;
  transaction_count: number;
  avg_price_per_pyeong_krw: number | string | null;
}

let cache: { at: number; value: BacktestSummary } | null = null;
const TTL = 60 * 60 * 1000;

function ymAdd(ym: string, delta: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6)) - 1 + delta;
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function runPredictionBacktest(): Promise<BacktestSummary> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;

  const empty: BacktestSummary = {
    cells: [],
    total: 0,
    hits: 0,
    hitRatePct: null,
    meanAbsErrorPct: null,
    monthsCovered: [],
    computedAt: new Date().toISOString(),
  };
  const sb = getServiceSupabase();
  if (!sb) return empty;

  const fromYm = ymAdd(new Date().toISOString().slice(0, 7).replace("-", ""), -(BACKTEST.lookbackMonths + 7));
  const { data, error } = await sb
    .from("market_region_monthly")
    .select("region_name,month,transaction_count,avg_price_per_pyeong_krw")
    .eq("deal_type", "trade")
    .eq("property_type", "apartment")
    .gte("month", fromYm)
    .gt("transaction_count", 0)
    .limit(20000);
  if (error || !Array.isArray(data)) return empty;

  /* region → month → {tx, per} */
  const byRegion = new Map<string, Map<string, { tx: number; per: number }>>();
  for (const r of data as Row[]) {
    const per = typeof r.avg_price_per_pyeong_krw === "string" ? Number(r.avg_price_per_pyeong_krw) : r.avg_price_per_pyeong_krw;
    if (!per || !Number.isFinite(per) || per <= 0) continue;
    const m = byRegion.get(r.region_name) ?? new Map();
    m.set(r.month, { tx: r.transaction_count, per });
    byRegion.set(r.region_name, m);
  }

  const cells: BacktestCell[] = [];
  const lastFullYm = ymAdd(new Date().toISOString().slice(0, 7).replace("-", ""), -1);
  for (const [region, months] of byRegion) {
    for (let i = 0; i < BACKTEST.lookbackMonths; i++) {
      const target = ymAdd(lastFullYm, -i);
      const t3 = ymAdd(target, -3);
      const t6 = ymAdd(target, -6);
      const a = months.get(target);
      const b = months.get(t3);
      const c = months.get(t6);
      if (!a || !b || !c) continue;
      if (a.tx < BACKTEST.minMonthlyTx || b.tx < BACKTEST.minMonthlyTx || c.tx < BACKTEST.minMonthlyTx) continue;
      const monthlyGrowth = Math.pow(b.per / c.per, 1 / 3) - 1;
      const predicted = b.per * Math.pow(1 + monthlyGrowth, 3);
      const errorPct = ((a.per - predicted) / predicted) * 100;
      cells.push({
        regionName: region,
        month: target,
        predictedPerPyeong: Math.round(predicted),
        actualPerPyeong: Math.round(a.per),
        errorPct: Math.round(errorPct * 10) / 10,
        hit: Math.abs(errorPct) <= BACKTEST.hitBandPct,
      });
    }
  }

  const total = cells.length;
  const hits = cells.filter((x) => x.hit).length;
  const summary: BacktestSummary = {
    cells: cells.sort((x, y) => (x.month < y.month ? 1 : -1)).slice(0, 400),
    total,
    hits,
    hitRatePct: total > 0 ? Math.round((hits / total) * 1000) / 10 : null,
    meanAbsErrorPct:
      total > 0
        ? Math.round((cells.reduce((s, x) => s + Math.abs(x.errorPct), 0) / total) * 10) / 10
        : null,
    monthsCovered: [...new Set(cells.map((x) => x.month))].sort(),
    computedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), value: summary };
  return summary;
}
