import type { PlanTier } from "@/components/ui-kit";

export type BillingPeriodMonths = 1 | 3 | 6 | 12;

/** 결제 주기 식별자 — 주간은 단건(자동갱신 없음) 전용이다. */
export type PaymentBilling = "weekly" | "monthly" | "annual";

/**
 * 플러스 주간권 — 1회성 단건 결제(자동 반복청구 없음).
 *
 * 2026-08-12 운영자 확정: "단건결제는 일주일치로 해줘 금액은 1100원".
 * 토스 심사 회신의 (a) 1회성 단건 결제 상품이 이것이다. 주간권은 플러스(pro)
 * 등급만 판다 — 프로(expert) 주간은 운영자가 정한 바 없어 만들지 않는다.
 * 만료는 기존 스윕 크론이 처리한다(durationDays=7 로 기록).
 */
export const WEEKLY_PASS = {
  tier: "pro",
  days: 7,
  totalKrw: 1_100,
  label: "플러스 주간권",
} as const;

export type PeriodPrice = {
  months: BillingPeriodMonths;
  totalKrw: number;
  monthlyEquivalentKrw: number;
  discountPct: number;
};

/**
 * 판매가 단일 출처 — 이 파일 밖에 가격 숫자를 적지 않는다.
 *
 * 2026-07-25 운영자 확정:
 * - 월간: 플러스(pro) 2,900원 / 프로(expert) 18,900원.
 *   (예전 표는 6,900/19,900원이었는데, 실제 청구 코드는 plans.ts 의 2,900/18,900원을
 *    쓰고 있었다. 표시가 청구와 다르면 그 자체로 허위 고지라 운영자에게 물었고,
 *    "2900/18900이 진짜"라는 답을 받았다.)
 * - 연간: 약 20% 할인 — 플러스 연 27,600원(월 2,300원꼴), 프로 연 181,200원(월 15,100원꼴).
 *   (같은 날 운영자 선택. 예전 표 기준으로는 연 결제 월환산가가 새 월간가보다 비싸지는
 *    모순이 생겨, 연간 가격도 함께 확정받았다.)
 *
 * 3·6개월 행은 삭제했다 — 결제 경로(toss/create)는 monthly|annual 두 가지만 팔고,
 * 화면(PlanCards)도 월간·연간만 보여 준다. 팔지도 않는 기간의 가격을 표에 남겨 두면
 * 이번처럼 아무도 안 보는 숫자가 썩는다.
 */
export const BILLING_PERIOD_PRICES: Record<
  Extract<PlanTier, "pro" | "expert">,
  PeriodPrice[]
> = {
  pro: [
    { months: 1, totalKrw: 2_900, monthlyEquivalentKrw: 2_900, discountPct: 0 },
    { months: 12, totalKrw: 27_600, monthlyEquivalentKrw: 2_300, discountPct: 20.7 },
  ],
  expert: [
    { months: 1, totalKrw: 18_900, monthlyEquivalentKrw: 18_900, discountPct: 0 },
    { months: 12, totalKrw: 181_200, monthlyEquivalentKrw: 15_100, discountPct: 20.1 },
  ],
};

export function periodPrice(
  tier: Extract<PlanTier, "pro" | "expert">,
  months: BillingPeriodMonths,
): PeriodPrice | undefined {
  return BILLING_PERIOD_PRICES[tier].find((p) => p.months === months);
}

/** 월간 판매가 — plans.ts 가 이 값을 읽는다(같은 숫자를 두 곳에 적지 않기 위해). */
export function monthlyPrice(tier: Extract<PlanTier, "pro" | "expert">): number {
  return periodPrice(tier, 1)?.totalKrw ?? 0;
}

/** 연 결제 UI — 12개월 행의 월 환산가 */
export function annualMonthlyEquivalent(tier: Extract<PlanTier, "pro" | "expert">): number {
  return periodPrice(tier, 12)?.monthlyEquivalentKrw ?? 0;
}

/**
 * 연간 결제로 1년에 실제로 덜 내는 금액(원). (C48)
 *
 * 화면에는 "월 2,300원꼴"만 있었다. 월 환산가는 **싸 보이게 만드는 표기**지
 * 얼마를 아끼는지를 말하지 않는다 — 연간을 고르는 사람이 알고 싶은 건 후자다.
 * 월간 12개월 총액과 연간 총액의 차이를 그대로 돌려준다(만들어 낸 수치 없음).
 * 연간 행이 없으면 null — 없는 할인을 0원으로 그리지 않는다.
 */
export function annualSavingKrw(
  tier: Extract<PlanTier, "pro" | "expert">,
): number | null {
  const rows = BILLING_PERIOD_PRICES[tier];
  const monthly = rows.find((r) => r.months === 1);
  const annual = rows.find((r) => r.months === 12);
  if (!monthly || !annual) return null;
  const saving = monthly.totalKrw * 12 - annual.totalKrw;
  return saving > 0 ? saving : null;
}

/** 연간 할인율(%) — 표에 적힌 값을 그대로 쓴다(재계산해서 미세하게 어긋나지 않게). */
export function annualDiscountPct(
  tier: Extract<PlanTier, "pro" | "expert">,
): number | null {
  const annual = BILLING_PERIOD_PRICES[tier].find((r) => r.months === 12);
  return annual && annual.discountPct > 0 ? annual.discountPct : null;
}

/* ============================================================
   [C42] 결제 한 건이 **며칠짜리인지** — 단일 출처.

   주문서형/결제창형 결제(/api/payments/toss/confirm)는 정기결제가 아니다.
   applyPlanToUserByEmail 에 durationDays 를 넘겨 그 기간만 플랜을 켜고,
   만료되면 plan-expiry-sweep 크론이 무료로 되돌린다 — **자동 갱신이 없다**.

   그런데 결제 화면에는 "플러스 · 월간 결제 / 2,900원" 만 적혀 있었다.
   "월간"이라고 쓰여 있으면 사람은 매달 자동으로 갱신된다고 읽는다. 실제로는
   30일 뒤 조용히 무료로 내려간다 — 우리가 말하지 않아서 생기는 오해다.
   기간 숫자를 화면과 서버가 각자 적으면 언젠가 어긋나므로 여기 한 곳에 둔다.
   ============================================================ */
export const BILLING_DURATION_DAYS: Record<PaymentBilling, number> = {
  weekly: WEEKLY_PASS.days,
  monthly: 30,
  annual: 365,
};

/** 사람이 읽는 이용 기간 — "7일" · "30일" · "365일(1년)" */
export function billingDurationLabel(billing: PaymentBilling): string {
  const d = BILLING_DURATION_DAYS[billing];
  return billing === "annual" ? `${d}일(1년)` : `${d}일`;
}

/**
 * 지금 결제하면 언제까지 쓸 수 있는지.
 * @param fromMs 기준 시각(ms). 테스트에서 고정하기 위해 주입받는다.
 */
export function accessEndsAtMs(billing: PaymentBilling, fromMs: number): number {
  return fromMs + BILLING_DURATION_DAYS[billing] * 24 * 60 * 60 * 1000;
}

/**
 * [966] 자동결제의 다음 청구 시각 — 만료 **이틀 전**에 청구한다(실패 시 만료 전에 재시도
 * 창이 생기고, applyPlan 의 연장 규칙이 있어 미리 청구해도 기간이 깎이지 않는다).
 * 등록 화면(BillingEnrollClient)·등록 라우트·갱신 크론이 같은 식을 써야 화면이 말한
 * 날짜와 실제 청구일이 같다 — 예전엔 화면은 +1개월, 서버는 +28일이었다.
 */
export const BILLING_CHARGE_LEAD_DAYS = 2;

export function nextChargeAtFrom(startMs: number, billing: "monthly" | "annual"): Date {
  const days = BILLING_DURATION_DAYS[billing] - BILLING_CHARGE_LEAD_DAYS;
  return new Date(startMs + days * 24 * 60 * 60 * 1000);
}
