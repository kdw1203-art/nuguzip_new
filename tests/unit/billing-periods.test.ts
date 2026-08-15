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
