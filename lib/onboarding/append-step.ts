import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

const STEPS = ["explore", "inspection", "share"] as const;
export type OnboardingStepId = (typeof STEPS)[number];
const SET = new Set<string>(STEPS);

function isStep(s: string): s is OnboardingStepId {
  return SET.has(s);
}

function normalizeProgress(value: unknown, completedAt: string | null) {
  const raw =
    value && typeof value === "object" && !Array.isArray(value) ? (value as { completedSteps?: unknown }) : {};
  const completedSteps = Array.isArray(raw.completedSteps)
    ? raw.completedSteps.map(String).filter(isStep)
    : [];
  return { completedSteps: [...new Set(completedSteps)] as string[], completedAt };
}

/**
 * 실제 가치 행동(관심단지/관심권역, 임장노트, 공개 공유)이 발생했을 때 온보딩 스텝을 서버에서 반영합니다.
 * GET /api/me/onboarding 과 동일한 `onboarding_progress` 형식을 씁니다.
 */
export async function appendOnboardingStep(email: string, step: OnboardingStepId): Promise<void> {
  if (!isStep(step)) return;
  const sb = getServiceSupabase();
  if (!sb) return;
  const em = email.trim().toLowerCase();
  const { data, error: readErr } = await sb
    .from("app_users")
    .select("onboarding_progress, onboarding_completed_at")
    .eq("email", em)
    .maybeSingle();
  if (readErr) return;
  const current = normalizeProgress(data?.onboarding_progress, data?.onboarding_completed_at ?? null);
  if (current.completedSteps.includes(step)) return;
  const completedSteps = [
    ...new Set<string>([...current.completedSteps, step]).values(),
  ].filter(isStep);
  const completedAt =
    completedSteps.length >= STEPS.length ? new Date().toISOString() : null;
  const progress = { completedSteps };
  const { error: upErr } = await sb
    .from("app_users")
    .update({
      onboarding_progress: progress,
      onboarding_completed_at: completedAt,
    })
    .eq("email", em);
  if (upErr) {
    logger.warn("[onboarding] append step failed", upErr.message);
  }
}
