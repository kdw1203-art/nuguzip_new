import type { PlanTier } from "@/components/ui-kit";
import { getPlan, PLAN_DEFINITIONS, type PlanDefinition } from "@/lib/subscriptions/plans";

export function formatPriceKrw(amount: number): string {
  if (amount <= 0) return "무료";
  return `₩${amount.toLocaleString("ko-KR")}`;
}

export function formatPlanMonthly(plan: PlanDefinition): string {
  if (plan.priceMonthly <= 0) return "무료";
  return `월 ${formatPriceKrw(plan.priceMonthly)}`;
}

export function formatPlanMonthlyShort(plan: PlanDefinition): string {
  if (plan.priceMonthly <= 0) return "0원";
  return `월 ${plan.priceMonthly.toLocaleString("ko-KR")}원`;
}

export function planByDisplayName(name: string): PlanDefinition | undefined {
  return PLAN_DEFINITIONS.find((p) => p.name === name);
}

export function formatTierMonthly(tier: PlanTier): string {
  return formatPlanMonthly(getPlan(tier));
}

/** 요금제 페이지·회원가입용 한 줄 요약 */
export function formatPublicPlanSummary(): string {
  const pro = planByDisplayName("PRO");
  const expert = planByDisplayName("EXPERT");
  const parts = ["FREE"];
  if (pro) parts.push(`PRO(${formatPlanMonthlyShort(pro)})`);
  if (expert) parts.push(`EXPERT(${formatPlanMonthlyShort(expert)})`);
  return parts.join(" · ");
}

/** PRO 배너 등 — 유료 플랜 최저가 */
export function lowestPaidPlanMonthlyLabel(): string {
  const paid = PLAN_DEFINITIONS.filter((p) => p.priceMonthly > 0);
  const min = paid.reduce((m, p) => Math.min(m, p.priceMonthly), paid[0]?.priceMonthly ?? 0);
  return min > 0 ? `${formatPriceKrw(min)}~` : "";
}
