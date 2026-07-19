/** 마이·요금 UI (세션 프로필) */
export type ProfilePlanTier = "free" | "pro" | "expert" | "enterprise";
/** 결제·락 UI (`lock-overlay`) — basic 은 Free 표기로 통일 */
export type BillingPlanTier = "basic" | "pro" | "expert" | "enterprise";

export function planLabel(plan: ProfilePlanTier | BillingPlanTier): string {
  if (plan === "free" || plan === "basic") return "FREE";
  if (plan === "pro") return "PRO";
  if (plan === "expert") return "EXPERT";
  return "ENTERPRISE";
}
