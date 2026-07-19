import { countBookmarks } from "@/lib/bookmarks/store";
import { countRunsThisMonth, appendRun } from "@/lib/ai/presets-store";
import { countConsultationsThisMonth } from "@/lib/expert-consultations/store-db";
import { countWatchlist } from "@/lib/watchlist/store-db";
import {
  checkAccess,
  FEATURE_RULES,
  normalizeAccessPlan,
  type FeatureKey,
  type PlanTier as AccessTier,
} from "@/lib/subscriptions/access";
import type { ProfilePlanTier } from "@/lib/subscriptions/labels";
import { loadMeProfile } from "@/lib/me/profile";
import { withUserQuotaLock } from "@/lib/subscriptions/quota-lock";

export type UsageItem = {
  key: FeatureKey | "watchlist";
  label: string;
  used: number;
  limit: number | null;
};

export function profilePlanToAccessTier(plan: string | null | undefined): AccessTier {
  return normalizeAccessPlan(plan);
}

/** 한도 API용 — JWT가 아닌 DB(app_users) plan 우선 */
export async function resolveQuotaPlan(
  email: string,
  sessionPlan?: string | null,
): Promise<ProfilePlanTier> {
  const profile = await loadMeProfile(email, { plan: sessionPlan ?? "free" });
  return profile.plan;
}

function quotaDeniedResponseFields(
  requiredTier: AccessTier,
  used: number,
  limit: number,
) {
  return {
    requiredTier: requiredTier === "basic" ? ("pro" as const) : requiredTier,
    usage: { used, limit },
  };
}

function limitFor(accessTier: AccessTier, feature: FeatureKey): number | null {
  return FEATURE_RULES[feature].monthlyLimit?.[accessTier] ?? null;
}

export async function getUsageSummary(
  email: string,
  profilePlan: ProfilePlanTier,
): Promise<{ plan: ProfilePlanTier; accessTier: AccessTier; items: UsageItem[] }> {
  const accessTier = profilePlanToAccessTier(profilePlan);

  const [aiUsed, bookmarkCount, watchlistCount, consultsThisMonth] = await Promise.all([
    countRunsThisMonth(email),
    countBookmarks(email),
    countWatchlist(email),
    countConsultationsThisMonth(email),
  ]);

  const items: UsageItem[] = [
    {
      key: "ai_analysis",
      label: "AI 분석 실행",
      used: aiUsed,
      limit: limitFor(accessTier, "ai_analysis"),
    },
    {
      key: "bookmark",
      label: "북마크",
      used: bookmarkCount,
      limit: limitFor(accessTier, "bookmark"),
    },
    {
      key: "interest_complex",
      label: "관심 단지",
      used: watchlistCount,
      limit: limitFor(accessTier, "interest_complex"),
    },
    {
      key: "expert_consult",
      label: "전문가 상담",
      used: consultsThisMonth,
      limit: limitFor(accessTier, "expert_consult"),
    },
  ];

  return { plan: profilePlan, accessTier, items };
}

export async function checkAiAnalysisQuota(
  email: string,
  profilePlan: string | null | undefined,
): Promise<
  | { allowed: true; used: number; limit: number | null }
  | { allowed: false; used: number; limit: number; requiredTier: AccessTier; message: string }
> {
  const accessTier = profilePlanToAccessTier(profilePlan);
  const access = checkAccess(accessTier, "ai_analysis");
  const used = await countRunsThisMonth(email);

  if (!access.allowed) {
    return {
      allowed: false,
      used,
      limit: 0,
      requiredTier: access.requiredTier,
      message: access.reason,
    };
  }

  const limit = access.limit;
  if (limit != null && used >= limit) {
    const requiredTier: AccessTier = accessTier === "basic" ? "pro" : "expert";
    return {
      allowed: false,
      used,
      limit,
      requiredTier,
      message: `이번 달 AI 분석 한도(${limit}회)를 모두 사용했습니다.`,
    };
  }

  return { allowed: true, used, limit };
}

export type QuotaDeniedPayload = {
  error: string;
  code: "QUOTA_EXCEEDED" | "TIER";
  requiredTier: "pro" | "expert";
  usage: { used: number; limit: number };
};

export function quotaDeniedJson(
  message: string,
  requiredTier: AccessTier,
  used: number,
  limit: number,
  code: "QUOTA_EXCEEDED" | "TIER" = "QUOTA_EXCEEDED",
): QuotaDeniedPayload {
  return {
    error: message,
    code,
    requiredTier: requiredTier === "basic" || requiredTier === "enterprise" ? "pro" : requiredTier,
    usage: { used, limit },
  };
}

/** AI run 저장 직전 한도 재검사 + 직렬화 */
export async function appendAiRunWithinQuota(
  email: string,
  sessionPlan: string | null | undefined,
  input: Parameters<typeof appendRun>[0],
): Promise<{ ok: true } | { ok: false; body: QuotaDeniedPayload }> {
  return withUserQuotaLock(`ai:${email}`, async () => {
    const plan = await resolveQuotaPlan(email, sessionPlan);
    const quota = await checkAiAnalysisQuota(email, plan);
    if (!quota.allowed) {
      return {
        ok: false as const,
        body: quotaDeniedJson(quota.message, quota.requiredTier, quota.used, quota.limit),
      };
    }
    await appendRun(input);
    return { ok: true as const };
  });
}

export async function checkExpertConsultQuota(
  email: string,
  profilePlan: string | null | undefined,
): Promise<
  | { allowed: true; used: number; limit: number | null }
  | { allowed: false; used: number; limit: number; requiredTier: AccessTier; message: string; code: "TIER" | "QUOTA_EXCEEDED" }
> {
  const accessTier = normalizeAccessPlan(profilePlan);
  const access = checkAccess(accessTier, "expert_consult");
  const used = await countConsultationsThisMonth(email);

  if (!access.allowed) {
    return {
      allowed: false,
      used,
      limit: 0,
      requiredTier: access.requiredTier,
      message: "전문가 상담은 PLUS 이상 멤버십에서 이용할 수 있습니다.",
      code: "TIER",
    };
  }

  const limit = access.limit;
  if (limit != null && used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      requiredTier: "expert",
      message: `이번 달 전문가 상담 한도(${limit}회)를 모두 사용했습니다.`,
      code: "QUOTA_EXCEEDED",
    };
  }

  return { allowed: true, used, limit };
}

export async function checkBookmarkAddQuota(
  email: string,
  profilePlan: string | null | undefined,
  alreadyBookmarked: boolean,
): Promise<
  | { allowed: true; used: number; limit: number | null }
  | { allowed: false; used: number; limit: number; requiredTier: AccessTier; message: string; code: "QUOTA_EXCEEDED" }
> {
  const accessTier = profilePlanToAccessTier(profilePlan);
  const access = checkAccess(accessTier, "bookmark");
  const used = await countBookmarks(email);
  const tierLimit = limitFor(accessTier, "bookmark");

  if (alreadyBookmarked) {
    return { allowed: true, used, limit: tierLimit };
  }

  if (!access.allowed) {
    return {
      allowed: false,
      used,
      limit: 0,
      requiredTier: access.requiredTier,
      message: access.reason,
      code: "QUOTA_EXCEEDED",
    };
  }

  const limit = access.limit;
  if (limit != null && used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      requiredTier: accessTier === "basic" ? "pro" : "expert",
      message: `북마크 한도(${limit}개)에 도달했습니다.`,
      code: "QUOTA_EXCEEDED",
    };
  }

  return { allowed: true, used, limit };
}

export async function checkWatchlistAddQuota(
  email: string,
  profilePlan: string | null | undefined,
  alreadyWatching: boolean,
): Promise<
  | { allowed: true; used: number; limit: number | null }
  | { allowed: false; used: number; limit: number; requiredTier: AccessTier; message: string; code: "QUOTA_EXCEEDED" }
> {
  const accessTier = profilePlanToAccessTier(profilePlan);
  const access = checkAccess(accessTier, "interest_complex");
  const used = await countWatchlist(email);
  const tierLimit = limitFor(accessTier, "interest_complex");

  if (alreadyWatching) {
    return { allowed: true, used, limit: tierLimit };
  }

  if (!access.allowed) {
    return {
      allowed: false,
      used,
      limit: 0,
      requiredTier: access.requiredTier,
      message: access.reason,
      code: "QUOTA_EXCEEDED",
    };
  }

  const limit = access.limit;
  if (limit != null && used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      requiredTier: accessTier === "basic" ? "pro" : "expert",
      message: `관심 단지 한도(${limit}개)에 도달했습니다.`,
      code: "QUOTA_EXCEEDED",
    };
  }

  return { allowed: true, used, limit };
}

export { quotaDeniedResponseFields };
