import { BASE_MONTHLY_PRICE_KRW } from "@/lib/subscriptions/base-prices";
import { periodPrice } from "@/lib/subscriptions/billing-periods";

/**
 * App Store / Play Store 상품 ID ↔ 플랜 매핑.
 * 가격은 확정 판매가 단일 소스(base-prices.ts)에서 파생 — 헤더에 "PRO 2,900"이라
 * 적어 두고 값은 6,900 을 들고 있던 불일치를 없앴다. 스토어 콘솔의 상품 가격도
 * 이 값과 같게 맞춰야 한다(여기 값은 검증·표시용이지 청구 주체가 아니다).
 */

export type IapPlan = "pro" | "expert";

const PRO_ANNUAL_TOTAL = periodPrice("pro", 12)?.totalKrw ?? BASE_MONTHLY_PRICE_KRW.pro * 12;
const EXPERT_ANNUAL_TOTAL =
  periodPrice("expert", 12)?.totalKrw ?? BASE_MONTHLY_PRICE_KRW.expert * 12;

export const IAP_PRODUCTS: Record<
  string,
  { plan: IapPlan; interval: "monthly" | "annual"; priceKrw: number; label: string }
> = {
  "com.nuguzip.pro.monthly": { plan: "pro", interval: "monthly", priceKrw: BASE_MONTHLY_PRICE_KRW.pro, label: "PRO" },
  "com.nuguzip.pro.annual": { plan: "pro", interval: "annual", priceKrw: PRO_ANNUAL_TOTAL, label: "PRO" },
  "com.nuguzip.expert.monthly": { plan: "expert", interval: "monthly", priceKrw: BASE_MONTHLY_PRICE_KRW.expert, label: "EXPERT" },
  "com.nuguzip.expert.annual": { plan: "expert", interval: "annual", priceKrw: EXPERT_ANNUAL_TOTAL, label: "EXPERT" },
  nuguzip_pro_monthly: { plan: "pro", interval: "monthly", priceKrw: BASE_MONTHLY_PRICE_KRW.pro, label: "PRO" },
  nuguzip_expert_monthly: { plan: "expert", interval: "monthly", priceKrw: BASE_MONTHLY_PRICE_KRW.expert, label: "EXPERT" },
};

export function resolveIapProduct(productId: string) {
  return IAP_PRODUCTS[productId] ?? null;
}
