import type { PlanTier } from "@/components/ui-kit";

export type BillingPeriodMonths = 1 | 3 | 6 | 12;

export type PeriodPrice = {
  months: BillingPeriodMonths;
  totalKrw: number;
  monthlyEquivalentKrw: number;
  discountPct: number;
};

/** 공개 3단계 — 1·3·6·12개월 총액 (2026 재설계안) */
export const BILLING_PERIOD_PRICES: Record<
  Extract<PlanTier, "pro" | "expert">,
  PeriodPrice[]
> = {
  pro: [
    { months: 1, totalKrw: 6_900, monthlyEquivalentKrw: 6_900, discountPct: 0 },
    { months: 3, totalKrw: 18_900, monthlyEquivalentKrw: 6_300, discountPct: 8.7 },
    { months: 6, totalKrw: 35_400, monthlyEquivalentKrw: 5_900, discountPct: 14.5 },
    { months: 12, totalKrw: 64_800, monthlyEquivalentKrw: 5_400, discountPct: 21.7 },
  ],
  expert: [
    { months: 1, totalKrw: 19_900, monthlyEquivalentKrw: 19_900, discountPct: 0 },
    { months: 3, totalKrw: 56_700, monthlyEquivalentKrw: 18_900, discountPct: 5.0 },
    { months: 6, totalKrw: 106_800, monthlyEquivalentKrw: 17_800, discountPct: 10.6 },
    { months: 12, totalKrw: 190_800, monthlyEquivalentKrw: 15_900, discountPct: 20.1 },
  ],
};

export function periodPrice(
  tier: Extract<PlanTier, "pro" | "expert">,
  months: BillingPeriodMonths,
): PeriodPrice | undefined {
  return BILLING_PERIOD_PRICES[tier].find((p) => p.months === months);
}

/** 연 결제 UI — 12개월 행의 월 환산가 */
export function annualMonthlyEquivalent(tier: Extract<PlanTier, "pro" | "expert">): number {
  return periodPrice(tier, 12)?.monthlyEquivalentKrw ?? 0;
}
