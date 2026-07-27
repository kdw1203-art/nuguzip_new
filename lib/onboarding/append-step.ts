import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { mergeTours, readTours } from "@/lib/onboarding/tours";

const STEPS = ["explore", "inspection", "share"] as const;
export const ONBOARDING_STEPS = STEPS;
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

export type OnboardingProgress = {
  completedSteps: OnboardingStepId[];
  isComplete: boolean;
  total: number;
};

/** 온보딩 진행 상황 조회 — A6 /my 진행바용. app_users.onboarding_progress 기준. */
export async function getOnboardingProgress(email: string): Promise<OnboardingProgress> {
  const total = STEPS.length;
  const sb = getServiceSupabase();
  const em = email.trim().toLowerCase();
  if (!sb || !em) return { completedSteps: [], isComplete: false, total };
  /* 예전에는 이 전체를 try/catch 로 감싸고 실패하면 빈 배열을 돌려줬다. 두 가지가
     틀렸다. 하나, Supabase 쿼리 빌더는 던지지 않고 { data, error } 를 돌려주므로
     그 catch 는 애초에 죽은 코드였다. 둘, 빈 배열은 진행바를 0% 로 되돌리는
     값이라 사용자에게는 "내가 해 둔 게 사라졌다"로 보인다 — 못 읽었을 뿐인데. */
  const { data, error } = await sb
    .from("app_users")
    .select("onboarding_progress, onboarding_completed_at")
    .eq("email", em)
    .maybeSingle();
  if (error) {
    throw new Error(
      `app_users 조회 실패 (온보딩 진행 상황) — ${error.message}` +
        `${error.code ? ` [${error.code}]` : ""}`,
    );
  }
  const norm = normalizeProgress(data?.onboarding_progress, data?.onboarding_completed_at ?? null);
  const completedSteps = norm.completedSteps.filter(isStep);
  return {
    completedSteps,
    isComplete: Boolean(norm.completedAt) || completedSteps.length >= total,
    total,
  };
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
  // 코치마크 투어 상태(tours)는 같은 JSON 에 살고 있으므로 덮어쓰지 않고 보존한다.
  const progress = mergeTours({ completedSteps }, readTours(data?.onboarding_progress));
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
