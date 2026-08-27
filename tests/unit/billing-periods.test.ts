import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WEEKLY_PASS,
  monthlyPrice,
  annualMonthlyEquivalent,
  periodPrice,
  BILLING_PERIOD_PRICES,
} from "../../lib/subscriptions/billing-periods.ts";

test("주간권 단일 출처 — pro/7일/1,100원", () => {
  assert.equal(WEEKLY_PASS.tier, "pro");
  assert.equal(WEEKLY_PASS.days, 7);
  assert.equal(WEEKLY_PASS.totalKrw, 1_100);
});

test("월간 판매가 — 심사 회신 가격표와 동일", () => {
  assert.equal(monthlyPrice("pro"), 2_900);
  assert.equal(monthlyPrice("expert"), 18_900);
});

test("연간 총액 = 월환산 × 12 (연 결제 UI 근거)", () => {
  // 연간 총액(BILLING_PERIOD_PRICES 12개월 행)과 월환산의 정합
  const proAnnual = periodPrice("pro", 12);
  const expertAnnual = periodPrice("expert", 12);
  assert.equal(proAnnual?.totalKrw, 27_600);
  assert.equal(expertAnnual?.totalKrw, 181_200);
  assert.equal(annualMonthlyEquivalent("pro"), 2_300);
  assert.equal(annualMonthlyEquivalent("expert"), 15_100);
});

test("연 결제가 월간보다 싸다(할인 방향이 맞다)", () => {
  // 월환산 연간가 < 월간가 여야 연 결제 유인이 성립
  assert.ok(annualMonthlyEquivalent("pro") < monthlyPrice("pro"));
  assert.ok(annualMonthlyEquivalent("expert") < monthlyPrice("expert"));
});

test("팔지 않는 기간(3·6개월) 행이 없다(썩는 숫자 방지)", () => {
  for (const tier of ["pro", "expert"] as const) {
    const months = BILLING_PERIOD_PRICES[tier].map((p) => p.months).sort();
    assert.deepEqual(months, [1, 12]);
  }
});

/* ── [C42] 결제 한 건의 이용 기간 — 화면과 서버가 같은 숫자를 쓴다 ── */
import {
  accessEndsAtMs,
  BILLING_DURATION_DAYS,
  billingDurationLabel,
} from "../../lib/subscriptions/billing-periods";

test("주간권 기간은 WEEKLY_PASS 와 어긋날 수 없다", () => {
  assert.equal(BILLING_DURATION_DAYS.weekly, WEEKLY_PASS.days);
});

test("월간은 30일, 연간은 365일", () => {
  assert.equal(BILLING_DURATION_DAYS.monthly, 30);
  assert.equal(BILLING_DURATION_DAYS.annual, 365);
});

test("기간 라벨은 연간만 '1년'을 덧붙인다", () => {
  assert.equal(billingDurationLabel("weekly"), "7일");
  assert.equal(billingDurationLabel("monthly"), "30일");
  assert.equal(billingDurationLabel("annual"), "365일(1년)");
});

test("종료 시각은 기준 시각 + 기간(일)", () => {
  const from = Date.UTC(2026, 0, 1, 0, 0, 0);
  const day = 24 * 60 * 60 * 1000;
  assert.equal(accessEndsAtMs("weekly", from), from + 7 * day);
  assert.equal(accessEndsAtMs("monthly", from), from + 30 * day);
  assert.equal(accessEndsAtMs("annual", from), from + 365 * day);
});

test("월간은 '한 달'이 아니라 30일이다 — 말과 계산이 같아야 한다", () => {
  const from = Date.UTC(2026, 0, 31, 0, 0, 0); // 1/31 결제
  const end = new Date(accessEndsAtMs("monthly", from));
  /* 달을 더하는 방식이었다면 2/28 이 됐을 것이다. 우리는 30일을 더한다. */
  assert.equal(end.toISOString().slice(0, 10), "2026-03-02");
});
