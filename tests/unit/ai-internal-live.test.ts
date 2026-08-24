/**
 * [Wave 9 후속] 자체 엔진(LLM 미연동 경로) 실단지 회귀 잠금.
 *
 * 라이브 검증에서 실측된 결함: 워크벤치가 실제 단지(base64 id)로 실행해도
 * 자체 엔진 요약이 "강남구 은마아파트 기준"(샘플 폴백)으로 시작했다.
 * 이 테스트는 실단지 입력이 샘플 단지로 바뀌지 않음을 잠근다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildInternalAnalysisMarkdown } from "../../lib/ai/analysis-engine.ts";

const LIVE_INPUT = {
  complexId: "7ISc7Jq4IOykkeuekeq1rAHshLjsnbTsp4Dsm4Dtg5zrponsnoXqtazsl60",
  complexName: "세이지움태릉입구역",
  region: "서울 중랑구",
  budgetKrw: 300000000,
  live: {
    priceKrw: 259000000,
    regionAvgSale: 661294270.8,
    jeonseRatio: 63.18,
    monthlyChangePct: 1.94,
    tradeCount: 301,
    wolseSharePct: 65,
    upcomingHouseholds: null,
    baseRatePct: 2.75,
    unsoldUnits: null,
    noteAvgScore: null,
  },
};

test("ai-diagnosis 실단지: 샘플 단지(은마)로 폴백하지 않는다", () => {
  const md = buildInternalAnalysisMarkdown("ai-diagnosis", { ...LIVE_INPUT });
  assert.ok(md.includes("세이지움태릉입구역"), "실단지 이름이 요약에 나와야 한다");
  assert.ok(md.includes("서울 중랑구"), "실단지 지역이 나와야 한다");
  assert.ok(!md.includes("은마아파트"), "샘플 단지 이름이 나오면 안 된다");
  assert.ok(!md.includes("샘플) 약 **0%**"), "없는 추세지표를 0%로 지어내면 안 된다");
  assert.ok(md.includes("25,900"), "실거래 평균(만원)이 반영돼야 한다");
  assert.ok(md.includes("63%"), "live 전세가율이 반올림 표기돼야 한다");
});

test("ai-prediction 실단지: 동일 경로 회귀 잠금", () => {
  const md = buildInternalAnalysisMarkdown("ai-prediction", { ...LIVE_INPUT });
  assert.ok(md.includes("세이지움태릉입구역"));
  assert.ok(!md.includes("은마아파트"));
});

test("ai-diagnosis 샘플 id(c1): 기존 샘플 경로는 그대로 동작", () => {
  const md = buildInternalAnalysisMarkdown("ai-diagnosis", { complexId: "c1" });
  assert.ok(md.includes("은마아파트"), "샘플 경로는 기존과 동일해야 한다");
  assert.ok(md.includes("5년 추세지표(샘플)"), "샘플 경로는 추세지표를 유지한다");
});

test("ai-compare 실단지 후보: '비어 있다'로 답하지 않고 지어낸 순위도 없다", () => {
  const md = buildInternalAnalysisMarkdown("ai-compare", {
    compare: [
      { id: "x1", name: "세이지움태릉입구역", region: "서울 중랑구" },
      { id: "x2", name: "래미안안양메가트리아", region: "안양 만안구" },
    ],
  });
  assert.ok(!md.includes("비어 있어"), "실단지 후보를 받았으면 비어 있다고 하면 안 된다");
  assert.ok(md.includes("세이지움태릉입구역") && md.includes("래미안안양메가트리아"));
  assert.ok(!md.includes("1위"), "실단지에 샘플 규칙 점수 순위를 매기면 안 된다");
});

test("ai-compare 샘플 id 경로: 기존 순위 표는 유지", () => {
  const md = buildInternalAnalysisMarkdown("ai-compare", { complexIds: ["c1", "c2"] });
  assert.ok(md.includes("1위"), "샘플 경로 순위 표는 기존과 동일해야 한다");
});
