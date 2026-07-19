/**
 * 관리자 대시보드·분석용 구독/MRR 집계.
 * 공개 요금은 lib/subscriptions/plans.ts 와 동일하게 맞추고,
 * expert_pro·expert_s 등 구 스키마 값은 레거시 행으로만 반영합니다.
 */
import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";

const proDef = PLAN_DEFINITIONS.find((p) => p.tier === "pro")!;
const expertDef = PLAN_DEFINITIONS.find((p) => p.tier === "expert")!;

export const MRR_PRICE_PRO_KRW = proDef.priceMonthly;
export const MRR_PRICE_EXPERT_KRW = expertDef.priceMonthly;
/** 과거 요금제·남은 계정 추정용 (공개 요금제에는 없음) */
export const MRR_PRICE_LEGACY_EXPERT_PRO_KRW = 29_900;

export function expertTierCount(planCounts: Record<string, number>): number {
  const pc = planCounts;
  return (pc.expert ?? 0) + (pc.expert_1 ?? 0) + (pc.expert_2 ?? 0);
}

export function expertProTierCount(planCounts: Record<string, number>): number {
  const pc = planCounts;
  return (pc.expert_pro ?? 0) + (pc.expert_s ?? 0);
}

/** 월 구독 MRR 추정(원). FREE·ADMIN·기타 유료 외 플랜만 반영. */
export function estimateSubscriptionMrrKrw(planCounts: Record<string, number>): number {
  const pc = planCounts;
  return (
    (pc.pro ?? 0) * MRR_PRICE_PRO_KRW +
    expertTierCount(pc) * MRR_PRICE_EXPERT_KRW +
    expertProTierCount(pc) * MRR_PRICE_LEGACY_EXPERT_PRO_KRW
  );
}

export function paidSubscriptionCount(planCounts: Record<string, number>): number {
  const pc = planCounts;
  return (pc.pro ?? 0) + expertTierCount(pc) + expertProTierCount(pc);
}

export type AdminSubscriptionRow = {
  id: string;
  label: string;
  count: number;
  priceLabel: string;
  mrrPortion: number;
};

export function buildSubscriptionAdminRows(
  planCounts: Record<string, number>,
): AdminSubscriptionRow[] {
  const pc = planCounts;
  const free = (pc.free ?? 0) + (pc.basic ?? 0) + (pc.trial ?? 0);
  const pro = pc.pro ?? 0;
  const ex = expertTierCount(pc);
  const exPro = expertProTierCount(pc);
  const rows: AdminSubscriptionRow[] = [
    { id: "free", label: "FREE", count: free, priceLabel: "무료", mrrPortion: 0 },
    {
      id: "pro",
      label: "PRO",
      count: pro,
      priceLabel: `₩${MRR_PRICE_PRO_KRW.toLocaleString("ko-KR")}/월`,
      mrrPortion: pro * MRR_PRICE_PRO_KRW,
    },
    {
      id: "expert",
      label: "EXPERT",
      count: ex,
      priceLabel: `₩${MRR_PRICE_EXPERT_KRW.toLocaleString("ko-KR")}/월`,
      mrrPortion: ex * MRR_PRICE_EXPERT_KRW,
    },
  ];
  if (exPro > 0) {
    rows.push({
      id: "expert_pro",
      label: "EXPERT PRO (레거시)",
      count: exPro,
      priceLabel: `₩${MRR_PRICE_LEGACY_EXPERT_PRO_KRW.toLocaleString("ko-KR")}/월(추정)`,
      mrrPortion: exPro * MRR_PRICE_LEGACY_EXPERT_PRO_KRW,
    });
  }
  return rows;
}

/** 파이 차트용: 인원이 있는 슬라이스만 (0이면 빈 배열 → 호출측에서 폴백). */
export function planPieSlicesFromCounts(
  planCounts: Record<string, number>,
): Array<{ name: string; value: number }> {
  const rows = buildSubscriptionAdminRows(planCounts);
  const slices = rows
    .filter((r) => r.count > 0)
    .map((r) => ({ name: r.label, value: r.count }));
  return slices;
}
