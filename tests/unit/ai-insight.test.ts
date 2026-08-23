import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UNCERTAINTY,
  judgeConfidence,
  diagnosisRadar,
  riskFlags,
  timingSignals,
  counterScenarios,
  buildNumberWhitelist,
  guardLlmNumbers,
  RISK_THRESHOLDS,
} from "../../lib/ai/insight-blocks.ts";
import type { LiveToolContext } from "../../lib/ai/live-context.ts";

/* [AI-07] 골든셋 회귀 — insight-blocks 판정 규칙을 스냅샷으로 잠근다.
   규칙을 바꾸면 여기 diff 로 "무엇이 달라졌는지"가 드러나야 한다. */

function ctx(partial: Partial<LiveToolContext>): LiveToolContext {
  return {
    generatedAt: "2026-08-23T00:00:00Z",
    complex: null,
    region: null,
    rent: null,
    supply: null,
    news: null,
    notes: null,
    macro: null,
    poi: null,
    ...partial,
  } as LiveToolContext;
}

const meta = { source: "t", asOf: "202608", sample: 100, href: null };

/* ── AI-03 불확실성 ── */
test("불확실성: 표본 5 미만 = 판단 불가", () => {
  assert.equal(judgeConfidence(4, 10), "insufficient");
  assert.equal(judgeConfidence(UNCERTAINTY.minSample, 10), "thin");
});
test("불확실성: 120일 초과 = 오래된 데이터", () => {
  assert.equal(judgeConfidence(100, UNCERTAINTY.staleDays + 1), "stale");
});
test("불확실성: 30건 미만 = 표본 적음, 이상이면 ok", () => {
  assert.equal(judgeConfidence(29, 10), "thin");
  assert.equal(judgeConfidence(30, 10), "ok");
  assert.equal(judgeConfidence(null, null), "ok");
});

/* ── AI-19 레이더 ── */
test("레이더: 월간 0% = 모멘텀 50, +3% = 100, -3% = 0", () => {
  const mk = (pct: number) =>
    diagnosisRadar(
      ctx({
        region: {
          id: null,
          name: "강남구",
          snapshot: { avgSale: 1, jeonseRatio: 50, saleChangeMonthly: pct, tradeCount: 150, period: "202608", ...meta },
          demographics: null,
        },
      }),
    ).find((a) => a.key === "momentum")!.score;
  assert.equal(mk(0), 50);
  assert.equal(mk(3), 100);
  assert.equal(mk(-3), 0);
});
test("레이더: 데이터 없는 축은 null(0점으로 지어내지 않는다)", () => {
  const axes = diagnosisRadar(ctx({}));
  for (const a of axes) assert.equal(a.score, null);
});
test("레이더: 거래 300건 = 유동성 100 상한", () => {
  const r = diagnosisRadar(
    ctx({
      region: {
        id: null,
        name: "강남구",
        snapshot: { avgSale: 1, jeonseRatio: 50, saleChangeMonthly: 0, tradeCount: 900, period: "202608", ...meta },
        demographics: null,
      },
    }),
  );
  assert.equal(r.find((a) => a.key === "liquidity")!.score, 100);
});
test("레이더: 입주 3,000세대 = 공급 여유 0", () => {
  const r = diagnosisRadar(
    ctx({ supply: { upcomingHouseholds: 3000, upcomingComplexes: 3, items: [], ...meta } }),
  );
  assert.equal(r.find((a) => a.key === "supply")!.score, 0);
});
test("레이더: 노트 평균 7.5점 = 정성 75", () => {
  const r = diagnosisRadar(
    ctx({ notes: { count: 5, avgScore: 7.5, latest: null, ...meta } }),
  );
  assert.equal(r.find((a) => a.key === "field")!.score, 75);
});

/* ── AI-21 리스크 플래그 ── */
test("플래그: 임계 경계값 — 미만은 미점등, 도달은 점등", () => {
  const base = {
    id: null,
    name: "강남구",
    demographics: null,
  };
  const at = riskFlags(
    ctx({
      region: {
        ...base,
        snapshot: { avgSale: 1, jeonseRatio: RISK_THRESHOLDS.jeonseRatioHigh, saleChangeMonthly: 0, tradeCount: RISK_THRESHOLDS.tradeDrop - 1, period: "202608", ...meta },
      },
    }),
  );
  assert.ok(at.some((f) => f.key === "liquidity"));
  assert.ok(at.some((f) => f.key === "gapRisk"));
  const under = riskFlags(
    ctx({
      region: {
        ...base,
        snapshot: { avgSale: 1, jeonseRatio: RISK_THRESHOLDS.jeonseRatioHigh - 1, saleChangeMonthly: 0, tradeCount: RISK_THRESHOLDS.tradeDrop, period: "202608", ...meta },
      },
    }),
  );
  assert.equal(under.length, 0);
});
test("플래그: 월세 비중 55%+ 는 info, 미분양 500+ 는 warn", () => {
  const f = riskFlags(
    ctx({
      rent: { wolseSharePct: 60, jeonseCount: 40, wolseCount: 60, medianMonthlyKrw: null, months: 3, ...meta },
      region: {
        id: null,
        name: "대구",
        snapshot: null,
        demographics: { population: 1, households: 1, unsoldUnits: 600, period: "202607", ...meta },
      },
    }),
  );
  assert.equal(f.find((x) => x.key === "wolse")!.level, "info");
  assert.equal(f.find((x) => x.key === "unsold")!.level, "warn");
});

/* ── AI-26 신호등 ── */
test("신호: 조정(-0.5%)=green · 과열(+0.8%)=red · 데이터 없음=na", () => {
  const mk = (pct: number | null) =>
    timingSignals(
      ctx(
        pct == null
          ? {}
          : {
              region: {
                id: null,
                name: "강남구",
                snapshot: { avgSale: 1, jeonseRatio: 50, saleChangeMonthly: pct, tradeCount: 50, period: "202608", ...meta },
                demographics: null,
              },
            },
      ),
    ).find((s) => s.key === "price")!.state;
  assert.equal(mk(-0.5), "green");
  assert.equal(mk(0.8), "red");
  assert.equal(mk(null), "na");
});
test("신호: 거래 30건 미만 green · 100건 이상 red", () => {
  const mk = (n: number) =>
    timingSignals(
      ctx({
        region: {
          id: null,
          name: "강남구",
          snapshot: { avgSale: 1, jeonseRatio: 50, saleChangeMonthly: 0, tradeCount: n, period: "202608", ...meta },
          demographics: null,
        },
      }),
    ).find((s) => s.key === "volume")!.state;
  assert.equal(mk(29), "green");
  assert.equal(mk(100), "red");
});

/* ── AI-04 반대 시나리오 ── */
test("반대 시나리오: 항상 1개 이상, 최대 3개", () => {
  assert.ok(counterScenarios(ctx({})).length >= 1);
  const full = counterScenarios(
    ctx({
      supply: { upcomingHouseholds: 100, upcomingComplexes: 1, items: [], ...meta },
      macro: { baseRatePct: 3, ...meta },
      region: {
        id: null,
        name: "강남구",
        snapshot: { avgSale: 1, jeonseRatio: 50, saleChangeMonthly: 1, tradeCount: 50, period: "202608", ...meta },
        demographics: null,
      },
    }),
  );
  assert.equal(full.length, 3);
});

/* ── AI-08 수치 가드 ── */
test("수치 가드: 입력에 있는 숫자·억/만 환산·연도는 통과", () => {
  const wl = buildNumberWhitelist([{ priceKrw: 1_230_000_000, pct: 2.5 }]);
  const r = guardLlmNumbers("최근 거래는 12.3억(2.5% 상승)이며 2026년 기준입니다.", wl);
  assert.equal(r.ok, true);
});
test("수치 가드: 근거 없는 숫자는 위반으로 잡는다", () => {
  const wl = buildNumberWhitelist([{ priceKrw: 1_230_000_000 }]);
  const r = guardLlmNumbers("내년에는 18.7억까지 오를 전망입니다.", wl);
  assert.equal(r.ok, false);
  assert.ok(r.violations.includes("18.7"));
});
