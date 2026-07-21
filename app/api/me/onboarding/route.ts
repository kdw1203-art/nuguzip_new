import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { awardPoints } from "@/lib/points/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STEPS = new Set(["explore", "inspection", "share"]);

type OnboardingProgress = {
  completedSteps: string[];
  completedAt: string | null;
};

function normalizeProgress(value: unknown, completedAt: string | null): OnboardingProgress {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as { completedSteps?: unknown })
      : {};
  const completedSteps = Array.isArray(raw.completedSteps)
    ? raw.completedSteps.map(String).filter((step) => ALLOWED_STEPS.has(step))
    : [];
  return { completedSteps: [...new Set(completedSteps)], completedAt };
}

export async function GET() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const sb = getServiceSupabase();
  if (!sb) {
    const progress = normalizeProgress(null, null);
    return NextResponse.json({ progress, steps: progress.completedSteps, stored: false });
  }
  const { data, error } = await sb
    .from("app_users")
    .select("onboarding_progress, onboarding_completed_at")
    .eq("email", session.user.email.trim().toLowerCase())
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const progress = normalizeProgress(data?.onboarding_progress, data?.onboarding_completed_at ?? null);
  return NextResponse.json({ progress, steps: progress.completedSteps, stored: true });
}

export async function PATCH(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    completedSteps?: unknown;
    step?: unknown;
  };
  const requested = Array.isArray(body.completedSteps)
    ? body.completedSteps.map(String)
    : typeof body.step === "string"
      ? [body.step]
      : [];
  const sb = getServiceSupabase();
  let currentSteps: string[] = [];
  if (sb && typeof body.step === "string" && !Array.isArray(body.completedSteps)) {
    const { data } = await sb
      .from("app_users")
      .select("onboarding_progress")
      .eq("email", session.user.email.trim().toLowerCase())
      .maybeSingle();
    currentSteps = normalizeProgress(data?.onboarding_progress, null).completedSteps;
  }
  const completedSteps = [
    ...new Set([...currentSteps, ...requested].filter((step) => ALLOWED_STEPS.has(step))),
  ];
  const completedAt =
    completedSteps.length >= ALLOWED_STEPS.size ? new Date().toISOString() : null;
  const progress = { completedSteps };

  if (!sb) {
    return NextResponse.json({
      progress: { ...progress, completedAt },
      steps: completedSteps,
      stored: false,
    });
  }

  const { data, error } = await sb
    .from("app_users")
    .update({
      onboarding_progress: progress,
      onboarding_completed_at: completedAt,
    })
    .eq("email", session.user.email.trim().toLowerCase())
    .select("onboarding_progress, onboarding_completed_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const normalized = normalizeProgress(data?.onboarding_progress, data?.onboarding_completed_at ?? null);
  // #4 온보딩 완주 리워드 — 3/3 완료 시 1회 보너스 (once 룰로 중복 방지)
  let bonus = 0;
  if (normalized.completedSteps.length >= ALLOWED_STEPS.size) {
    try {
      const res = await awardPoints(session.user.email.trim().toLowerCase(), "onboarding_complete");
      bonus = res.awarded;
    } catch {
      // 포인트 적립 실패는 온보딩 저장을 막지 않음
    }
  }
  return NextResponse.json({
    progress: normalized,
    steps: normalized.completedSteps,
    stored: true,
    bonusAwarded: bonus,
  });
}

