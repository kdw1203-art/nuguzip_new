/**
 * App Store / Play Store 상품 ID ↔ 플랜 매핑.
 *
 * priceKrw 는 billing-periods.ts 단일 출처에서 읽는다 — 여기 하드코딩돼 있던
 * 6,900/19,900원은 2026-07-25 운영자 확정가(2,900/18,900원)와 달랐고, 파일 첫 줄
 * 주석은 이미 "PRO 2,900 / EXPERT 18,900" 이라 적어 놓고 데이터는 옛 값이었다.
 * 주의: 스토어에 실제로 노출되는 가격은 App Store Connect / Play Console 에서
 * 별도로 설정한다 — 스토어 등록 시 이 값과 일치시켜야 한다(불일치 시 여기가 아니라
 * 스토어 콘솔이 소비자에게 보이는 값이다).
 */
import { monthlyPrice, periodPrice } from "@/lib/subscriptions/billing-periods";

export type IapPlan = "pro" | "expert";

const PRO_M = monthlyPrice("pro");
const PRO_Y = periodPrice("pro", 12)?.totalKrw ?? 0;
const EXP_M = monthlyPrice("expert");
const EXP_Y = periodPrice("expert", 12)?.totalKrw ?? 0;

export const IAP_PRODUCTS: Record<
  string,
  { plan: IapPlan; interval: "monthly" | "annual"; priceKrw: number; label: string }
> = {
  "com.nuguzip.pro.monthly": { plan: "pro", interval: "monthly", priceKrw: PRO_M, label: "PRO" },
  "com.nuguzip.pro.annual": { plan: "pro", interval: "annual", priceKrw: PRO_Y, label: "PRO" },
  "com.nuguzip.expert.monthly": { plan: "expert", interval: "monthly", priceKrw: EXP_M, label: "EXPERT" },
  "com.nuguzip.expert.annual": { plan: "expert", interval: "annual", priceKrw: EXP_Y, label: "EXPERT" },
  nuguzip_pro_monthly: { plan: "pro", interval: "monthly", priceKrw: PRO_M, label: "PRO" },
  nuguzip_expert_monthly: { plan: "expert", interval: "monthly", priceKrw: EXP_M, label: "EXPERT" },
};

export function resolveIapProduct(productId: string) {
  return IAP_PRODUCTS[productId] ?? null;
}
