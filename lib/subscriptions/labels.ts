/**
 * 플랜 표시명 — **단일 출처.**
 *
 * 왜 생겼나(2026-08-26 실사): 같은 플랜을 부르는 이름이 코드 안에 여섯 벌 있었고,
 * 서로 달랐다.
 *
 *   lib/subscriptions/labels.ts        pro="PRO"    expert="EXPERT"
 *   lib/subscriptions/billing-history  pro="플러스"  expert="프로 (전문가)"
 *   app/api/cron/billing-renewals      pro="플러스"  expert="프로"
 *   app/payment/success                pro="플러스"  expert="프로 (전문가)"
 *   app/subscription/BillingAutopayCard pro="플러스" expert="프로"
 *   lib/inspection/note-deck           pro="PRO"    expert="EXPERT"
 *   app/my/page.tsx (자체 함수)         pro="플러스"  expert="프로 (전문가)"
 *
 * 결과: 요금제 화면에서 "플러스"를 사고 마이페이지에 가면 "PRO"가 떠 있었다.
 * 같은 화면(요금제) 안에서도 카드는 "프로 (전문가)", 비교표는 "프로"였다.
 * 사용자는 자기가 산 게 그건지 확인할 방법이 없다 — 환불 문의가 되는 종류의 불일치다.
 *
 * 어느 이름이 맞는가: **토스 심사 회신에 적어 낸 이름**이 기준이다
 * (scripts/check-toss-review-freeze.mjs 의 가격 잠금 주석 참고 —
 *  "주간 1,100 · 플러스 2,900/27,600 · 프로 18,900/181,200").
 * 즉 고객이 실제로 구매한 상품명은 **무료 / 플러스 / 프로** 다.
 *
 * 새 지역 맵을 만들지 못하게 scripts/check-plan-labels.mjs 가 빌드에서 막는다.
 */

/** 마이·요금 UI (세션 프로필) */
export type ProfilePlanTier = "free" | "pro" | "expert" | "enterprise";
/** 결제·락 UI (`lock-overlay`) — basic 은 free 와 같은 표기 */
export type BillingPlanTier = "basic" | "pro" | "expert" | "enterprise";

export type AnyPlanTier = ProfilePlanTier | BillingPlanTier;

const CANONICAL: Record<string, string> = {
  free: "무료",
  basic: "무료",
  pro: "플러스",
  expert: "프로",
  enterprise: "엔터프라이즈",
};

/**
 * 고객이 보는 플랜 이름. 모르는 값은 **지어내지 않고** 받은 문자열을 그대로 돌려준다
 * (예: DB 에 새 tier 가 생겼는데 여기 반영 전이면, 화면에 그 원문이 보여야
 *  "무료"로 잘못 표시되는 것보다 낫다).
 */
export function planLabel(plan: AnyPlanTier | string | null | undefined): string {
  const k = String(plan ?? "").trim().toLowerCase();
  return CANONICAL[k] ?? (k || "—");
}

/** 배지·헤더용 — 유료 플랜에만 ✦ 를 붙인다(무료에 별을 붙이면 등급이 흐려진다). */
export function planBadgeLabel(plan: AnyPlanTier | string | null | undefined): string {
  const k = String(plan ?? "").trim().toLowerCase();
  const name = planLabel(k);
  return k === "pro" || k === "expert" || k === "enterprise" ? `✦ ${name}` : name;
}

/** 유료 플랜인가 — 배지 노출·업그레이드 제안 분기에 쓴다. */
export function isPaidPlan(plan: AnyPlanTier | string | null | undefined): boolean {
  const k = String(plan ?? "").trim().toLowerCase();
  return k === "pro" || k === "expert" || k === "enterprise";
}
