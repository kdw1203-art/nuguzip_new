/* [944] AI 초안 rule 경로 회귀 잠금 — "지어내지 않는다"의 코드화.
   · rule 폴백은 점수(checks·satisfaction)를 절대 제안하지 않는다
   · 조건부 확인 포인트는 데이터가 그 조건을 만족할 때만 나온다
   · 근거 줄은 값이 있는 축만 만든다(없는 축을 0·평균 등으로 채우지 않는다) */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ruleDraft,
  evidenceLinesFromContext,
  conditionalTodos,
} from "../../lib/ai/note-draft-core.ts";
import type { LiveToolContext } from "../../lib/ai/live-context.ts";

const emptyCtx: LiveToolContext = {
  generatedAt: new Date().toISOString(),
  complex: null,
  region: null,
  rent: null,
  supply: null,
  news: null,
  notes: null,
  macro: null,
  poi: null,
};

const axisMeta = { asOf: "202608", source: "테스트" } as const;

function ctxWith(partial: Partial<LiveToolContext>): LiveToolContext {
  return { ...emptyCtx, ...partial };
}

test("rule 폴백은 점수를 제안하지 않는다", () => {
  const d = ruleDraft({ regionName: "서울 강남구", aptName: "테스트단지" }, emptyCtx);
  assert.deepEqual(d.checks, {});
  assert.equal(d.satisfaction, null);
  assert.equal(d.scoreRationale, null);
  assert.equal(d.llmUsed, false);
  assert.ok(d.title.includes("테스트단지"));
  assert.ok(d.todo.length >= 4);
});

test("빈 컨텍스트 → 근거 줄 0개 (없는 값을 채우지 않는다)", () => {
  assert.deepEqual(evidenceLinesFromContext(emptyCtx), []);
});

test("전세가율 70% 이상일 때만 갭 리스크 확인 포인트가 나온다", () => {
  const high = ctxWith({
    region: {
      id: "gangnam",
      name: "강남구",
      snapshot: { avgSale: 2_000_000_000, jeonseRatio: 74, saleChangeMonthly: 0.2, tradeCount: 10, period: "202608", ...axisMeta },
      demographics: null,
    },
  });
  const low = ctxWith({
    region: {
      id: "gangnam",
      name: "강남구",
      snapshot: { avgSale: 2_000_000_000, jeonseRatio: 55, saleChangeMonthly: 0.2, tradeCount: 10, period: "202608", ...axisMeta },
      demographics: null,
    },
  });
  assert.ok(conditionalTodos(high).some((t) => t.includes("전세가율 74%")));
  assert.ok(!conditionalTodos(low).some((t) => t.includes("전세가율")));
});

test("근거 줄에는 시점·출처가 실린다", () => {
  const ctx = ctxWith({
    region: {
      id: "mapo",
      name: "마포구",
      snapshot: { avgSale: 1_450_000_000, jeonseRatio: 60, saleChangeMonthly: 1.3, tradeCount: 308, period: "202608", ...axisMeta },
      demographics: null,
    },
  });
  const lines = evidenceLinesFromContext(ctx);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes("2026.08"));
  assert.ok(lines[0].includes("한국부동산원"));
  assert.ok(lines[0].includes("14.5억"));
});
