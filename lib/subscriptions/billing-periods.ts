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
