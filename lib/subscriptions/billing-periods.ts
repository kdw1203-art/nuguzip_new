import type { PlanTier } from "@/components/ui-kit";
import { BASE_MONTHLY_PRICE_KRW } from "./base-prices";

export type BillingPeriodMonths = 1 | 3 | 6 | 12;

export type PeriodPrice = {
  months: BillingPeriodMonths;
  totalKrw: number;
  monthlyEquivalentKrw: number;
  discountPct: number;
};

/**
 * 기간별 할인율 정책 (3개월 5% · 6개월 10% · 12개월 20%).
 * 실제 금액은 아래 buildPeriodPrices 가 확정 판매가(base-prices.ts 단일 소스)에
 * 할인율을 적용해 계산한다 — 여기에 원 단위 금액을 직접 적지 않는다.
 * 예전에는 이 파일이 6,900/19,900 기반 총액을 하드코딩하고 있어서
 * plans.ts 의 확정 판매가(2,900/18,900)와 어긋났다.
 */
const PERIOD_DISCOUNT_RATE: Record<BillingPeriodMonths, number> = {
  1: 0,
  3: 0.05,
  6: 0.1,
  12: 0.2,
};

/** 월 환산가는 100원 단위 절사(한국 표시 관행), 총액 = 월 환산가 × 개월. */
function buildPeriodPrices(tier: "pro" | "expert"): PeriodPrice[] {
  const base = BASE_MONTHLY_PRICE_KRW[tier];
  return ([1, 3, 6, 12] as const).map((months) => {
    const rate = PERIOD_DISCOUNT_RATE[months];
    const monthlyEquivalentKrw = Math.floor((base * (1 - rate)) / 100) * 100;
    return {
      months,
      totalKrw: monthlyEquivalentKrw * months,
      monthlyEquivalentKrw,
      // 표시용 할인율은 절사 반영 후 실제 비율로 다시 계산 (약속한 값보다 후하게 나올 수는 있어도 박하게 나오지는 않는다)
      discountPct: base > 0 ? ((base - monthlyEquivalentKrw) / base) * 100 : 0,
    };
  });
}

/** 공개 2단계(pro·expert) — 1·3·6·12개월. 전부 확정 판매가에서 파생. */
export const BILLING_PERIOD_PRICES: Record<
  Extract<PlanTier, "pro" | "expert">,
  PeriodPrice[]
> = {
  pro: buildPeriodPrices("pro"),
  expert: buildPeriodPrices("expert"),
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
