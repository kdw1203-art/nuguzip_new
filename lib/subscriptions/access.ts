/**
 * 구독 접근 제어 유틸리티
 *
 * 각 기능별 최소 필요 플랜과 사용량 제한을 정의합니다.
 * 서버 컴포넌트/API 라우트에서 사용하세요.
 */

export type PlanTier = "basic" | "pro" | "expert" | "enterprise";

/** 티어 순서 (높을수록 상위) */
const TIER_ORDER: Record<PlanTier, number> = {
  basic: 0,
  pro: 1,
  expert: 2,
  enterprise: 3,
};

/** free/basic → basic 등 세션 plan 문자열 정규화 */
export function normalizeAccessPlan(userTier: string | null | undefined): PlanTier {
  const s = (userTier ?? "basic").toLowerCase().trim();
  if (s === "enterprise") return "enterprise";
  if (s === "expert") return "expert";
  if (s === "pro") return "pro";
  return "basic";
}

/** 최소 필요 티어를 충족하는지 확인 */
export function hasPlan(userTier: string | null | undefined, requiredTier: PlanTier): boolean {
  const tier = normalizeAccessPlan(userTier);
  return TIER_ORDER[tier] >= TIER_ORDER[requiredTier];
}

// ── 기능별 접근 제어 정의 ────────────────────────────────────

export type FeatureKey =
  | "community_read"
  | "community_write"
  | "community_comment"
  | "group_join"           // 모임 참여
  | "group_create"         // 모임 개설
  | "group_join_pass" // Group Pass·유료 모임 참여 (요금제 티어 Pro+)
  | "report_free"          // 무료 리포트 열람
  | "report_paid"          // 유료 리포트 열람
  | "expert_view"          // 전문가 프로필 조회
  | "expert_consult"       // 전문가 1:1 상담
  | "expert_register"      // 전문가 등록
  | "ai_chat"              // AI 동네길잡이 채팅
  | "ai_analysis"          // AI 투자 분석
  | "ai_inspection_note"   // AI 임장노트 자동작성
  | "inspection_create"    // 임장노트 작성
  | "bookmark"             // 북마크
  | "interest_complex"     // 관심 단지
  | "data_export"          // 데이터 내보내기
  | "notification_realtime" // 실시간 알림
  | "ad_free"             // 광고 제거
  | "report_sell"         // 리포트 판매
  | "compare_tray";       // 비교 트레이

type FeatureRule = {
  minTier: PlanTier;
  /** 플랜별 월간 사용 횟수 한도 (null = 무제한) */
  monthlyLimit?: Partial<Record<PlanTier, number | null>>;
};

export const FEATURE_RULES: Record<FeatureKey, FeatureRule> = {
  community_read:        { minTier: "basic" },
  community_write:       { minTier: "basic" },
  community_comment:     { minTier: "basic" },
  report_free:           { minTier: "basic" },
  expert_view:           { minTier: "basic" },
  inspection_create:     { minTier: "basic" },
  bookmark: {
    minTier: "basic",
    monthlyLimit: { basic: 10, pro: 100, expert: null, enterprise: null },
  },
  interest_complex: {
    minTier: "basic",
    monthlyLimit: { basic: 10, pro: 100, expert: null, enterprise: null },
  },
  group_join: {
    minTier: "basic",
    monthlyLimit: { basic: 3, pro: null, expert: null, enterprise: null },
  },
  ai_chat: {
    minTier: "basic",
    monthlyLimit: { basic: 3, pro: 50, expert: null, enterprise: null },
  },
  ai_analysis: {
    minTier: "basic",
    monthlyLimit: { basic: 3, pro: 50, expert: null, enterprise: null },
  },
  report_paid:          { minTier: "pro" },
  group_join_pass: { minTier: "pro" },
  group_create:         { minTier: "pro" },
  ad_free:              { minTier: "pro" },
  compare_tray: {
    minTier: "basic",
    monthlyLimit: { basic: 2, pro: 10, expert: null, enterprise: null },
  },
  report_sell:          { minTier: "pro" },
  notification_realtime:{ minTier: "pro" },
  expert_consult: {
    minTier: "pro",
    monthlyLimit: { pro: 2, expert: 10, enterprise: null },
  },
  ai_inspection_note: {
    minTier: "basic",
    monthlyLimit: { basic: 2, pro: 30, expert: null, enterprise: null },
  },
  data_export: {
    minTier: "pro",
    monthlyLimit: { pro: 10, expert: null, enterprise: null },
  },
  expert_register:      { minTier: "expert" },
};

export type AccessResult =
  | { allowed: true; limit: number | null }
  | { allowed: false; requiredTier: PlanTier; reason: string };

/**
 * 특정 기능에 대한 접근 여부를 반환합니다.
 * @param userTier 현재 사용자 플랜 (basic / pro / expert)
 * @param feature 체크할 기능 키
 */
export function checkAccess(
  userTier: string | null | undefined,
  feature: FeatureKey,
): AccessResult {
  const rule = FEATURE_RULES[feature];
  const tier = normalizeAccessPlan(userTier);

  if (!hasPlan(tier, rule.minTier)) {
    return {
      allowed: false,
      requiredTier: rule.minTier,
      reason: `이 기능은 ${rule.minTier.toUpperCase()} 이상 플랜에서 이용 가능합니다.`,
    };
  }

  const limit = rule.monthlyLimit?.[tier] ?? null;
  return { allowed: true, limit };
}

/**
 * 접근 불가 시 업그레이드 안내 메시지를 반환합니다.
 */
export function upgradeMessage(requiredTier: PlanTier): string {
  const tierLabel: Record<PlanTier, string> = {
    basic: "FREE",
    pro: "PRO (월 2,900원)",
    expert: "EXPERT (월 18,900원)",
    enterprise: "ENTERPRISE (B2B 문의)",
  };
  return `이 기능을 이용하려면 ${tierLabel[requiredTier]} 이상으로 업그레이드가 필요합니다.`;
}

/** 간단 가드: 접근 불가 시 throw */
export function assertAccess(
  userTier: string | null | undefined,
  feature: FeatureKey,
): void {
  const result = checkAccess(userTier, feature);
  if (!result.allowed) {
    throw new Error(upgradeMessage(result.requiredTier));
  }
}
