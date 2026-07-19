/** App Store / Play Store 상품 ID ↔ 플랜 매핑 (PRO 6,900 / EXPERT 19,900) */

export type IapPlan = "pro" | "expert";

export const IAP_PRODUCTS: Record<
  string,
  { plan: IapPlan; interval: "monthly" | "annual"; priceKrw: number; label: string }
> = {
  "com.nuguzip.pro.monthly": { plan: "pro", interval: "monthly", priceKrw: 6_900, label: "PRO" },
  "com.nuguzip.pro.annual": { plan: "pro", interval: "annual", priceKrw: 64_800, label: "PRO" },
  "com.nuguzip.expert.monthly": { plan: "expert", interval: "monthly", priceKrw: 19_900, label: "EXPERT" },
  "com.nuguzip.expert.annual": { plan: "expert", interval: "annual", priceKrw: 190_800, label: "EXPERT" },
  nuguzip_pro_monthly: { plan: "pro", interval: "monthly", priceKrw: 6_900, label: "PRO" },
  nuguzip_expert_monthly: { plan: "expert", interval: "monthly", priceKrw: 19_900, label: "EXPERT" },
};

export function resolveIapProduct(productId: string) {
  return IAP_PRODUCTS[productId] ?? null;
}
