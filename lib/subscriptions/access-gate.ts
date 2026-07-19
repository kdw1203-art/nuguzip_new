/**
 * Free / Pro / Expert 요금제 게이트 (세션 `plan` 과 별도 타입).
 * `lib/subscriptions/access.ts` 의 `basic`·기능별 한도와 병행해 사용합니다.
 */

export type PlanTier = "free" | "pro" | "expert" | "enterprise";

const order: Record<PlanTier, number> = {
  free: 0,
  pro: 1,
  expert: 2,
  enterprise: 3,
};

/** 세션·DB 등에서 온 문자열을 게이트 티어로 정규화 (`basic` → `free`). */
export function normalizePlanToGate(raw: string | null | undefined): PlanTier {
  const s = (raw ?? "free").toLowerCase().trim();
  if (s === "enterprise") return "enterprise";
  if (s === "expert") return "expert";
  if (s === "pro") return "pro";
  if (s === "basic" || s === "free") return "free";
  return "free";
}

export function hasAccess(userPlan: PlanTier, minPlan: PlanTier): boolean {
  return order[userPlan] >= order[minPlan];
}

/** 기능 키별 최소 플랜 (로드맵 Sprint1 게이트 통합용). */
export function requirePlan(feature: string): PlanTier {
  const map: Record<string, PlanTier> = {
    basic_cards: "free",
    advanced_filters: "pro",
    compare_report: "pro",
    ai_note_advanced: "pro",
    ai_deep_analysis: "expert",
    expert_priority_reply: "expert",
    pdf_export: "expert",
    filter_preset_share: "pro",
    compare_board: "pro",
    price_analysis: "pro",
    investment_scenario: "pro",
    b2b_api: "enterprise",
    bulk_pdf: "enterprise",
    team_admin: "enterprise",
  };
  return map[feature] ?? "free";
}

export function sessionHasFeature(sessionPlan: string | null | undefined, feature: string): boolean {
  return hasAccess(normalizePlanToGate(sessionPlan), requirePlan(feature));
}
