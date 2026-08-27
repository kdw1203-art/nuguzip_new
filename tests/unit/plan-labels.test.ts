import { strict as assert } from "node:assert";
import test from "node:test";

import { isPaidPlan, planBadgeLabel, planLabel } from "../../lib/subscriptions/labels";

/* 토스 심사 회신에 적어 낸 상품명이 기준이다
   (scripts/check-toss-review-freeze.mjs: "주간 1,100 · 플러스 2,900/27,600 · 프로 18,900/181,200"). */

test("고객이 산 이름 그대로 부른다", () => {
  assert.equal(planLabel("pro"), "플러스");
  assert.equal(planLabel("expert"), "프로");
  assert.equal(planLabel("free"), "무료");
  assert.equal(planLabel("basic"), "무료");
  assert.equal(planLabel("enterprise"), "엔터프라이즈");
});

test("예전에 흩어져 있던 표기들은 더 이상 나오지 않는다", () => {
  /* 실사에서 나온 실제 문자열들 — 하나라도 살아 있으면 화면끼리 어긋난다 */
  for (const bad of ["PRO", "EXPERT", "프로 (전문가)", "베이직", "무료 플랜"]) {
    assert.notEqual(planLabel("pro"), bad);
    assert.notEqual(planLabel("expert"), bad);
    assert.notEqual(planLabel("free"), bad);
  }
});

test("대소문자·공백을 흘려도 같은 이름", () => {
  assert.equal(planLabel(" PRO "), "플러스");
  assert.equal(planLabel("Expert"), "프로");
});

test("모르는 값은 지어내지 않고 원문을 돌려준다", () => {
  /* DB 에 새 tier 가 생겼는데 여기 반영 전이면, 원문이 보이는 편이
     "무료"로 잘못 표시되는 것보다 낫다 — 잘못된 확신을 만들지 않는다. */
  assert.equal(planLabel("team"), "team");
  assert.equal(planLabel(null), "—");
  assert.equal(planLabel(undefined), "—");
  assert.equal(planLabel(""), "—");
});

test("배지는 유료 플랜에만 ✦ 를 붙인다", () => {
  assert.equal(planBadgeLabel("pro"), "✦ 플러스");
  assert.equal(planBadgeLabel("expert"), "✦ 프로");
  assert.equal(planBadgeLabel("free"), "무료");
  assert.equal(planBadgeLabel("basic"), "무료");
});

test("유료 판정", () => {
  assert.equal(isPaidPlan("pro"), true);
  assert.equal(isPaidPlan("expert"), true);
  assert.equal(isPaidPlan("enterprise"), true);
  assert.equal(isPaidPlan("free"), false);
  assert.equal(isPaidPlan("basic"), false);
  assert.equal(isPaidPlan(null), false);
});

/* ── 연간 절감액 (C48) ─────────────────────────────────────────── */
import { annualDiscountPct, annualSavingKrw } from "../../lib/subscriptions/billing-periods";

test("연간 절감액은 월간 12개월 총액과 연간 총액의 차이다", () => {
  // 플러스: 2,900 × 12 = 34,800 vs 연 27,600 → 7,200원
  assert.equal(annualSavingKrw("pro"), 7_200);
  // 프로: 18,900 × 12 = 226,800 vs 연 181,200 → 45,600원
  assert.equal(annualSavingKrw("expert"), 45_600);
});

test("할인율은 표에 적힌 값을 그대로 쓴다", () => {
  /* 다시 계산하면 20.68…% 같은 값이 나와 표기와 미세하게 어긋난다 */
  assert.equal(annualDiscountPct("pro"), 20.7);
  assert.equal(annualDiscountPct("expert"), 20.1);
});
