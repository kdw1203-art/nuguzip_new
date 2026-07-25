import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getVerifiedOnboarding } from "./verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 온보딩 진행 API.
 *
 * - completedSteps(explore·inspection·share)는 더 이상 클라이언트 신고를 믿지 않는다.
 *   GET/PATCH 모두 서버가 실데이터(user_watchlist·inspection_notes)로 판정한다
 *   — ./verify.ts 참조. 200P 완주 보너스도 그 판정으로만, 멱등 지급된다.
 * - /welcome 위저드의 화면 진행은 별도 id(profile_region·profile_budget·profile_purpose)로
 *   `onboarding_progress.wizardSteps` 에 기록한다. 퍼널 관측용일 뿐 스텝 완료·보너스와 무관하다.
 */

const WIZARD_STEPS = new Set(["profile_region", "profile_budget", "profile_purpose"]);

function readWizardSteps(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const raw = (value as { wizardSteps?: unknown }).wizardSteps;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(String).filter((s) => WIZARD_STEPS.has(s)))];
}

export async function GET() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const sb = getServiceSupabase();
  const verified = await getVerifiedOnboarding(session.user.email);
  return NextResponse.json({
    progress: { completedSteps: verified.completedSteps, completedAt: verified.completedAt },
    steps: verified.completedSteps,
    stored: Boolean(sb),
    bonusAwarded: verified.bonusAwarded,
  });
}

export async function PATCH(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const email = session.user.email.trim().toLowerCase();
  const body = (await req.json().catch(() => ({}))) as {
    completedSteps?: unknown;
    step?: unknown;
  };
  // 위저드 화면 진행 id 만 받는다. 과거 클라이언트가 보내던 explore/inspection/share 는
  // 서버 판정으로 대체됐으므로 조용히 무시한다 (기록도, 보너스도 없음).
  const requested = (
    Array.isArray(body.completedSteps)
      ? body.completedSteps.map(String)
      : typeof body.step === "string"
        ? [body.step]
        : []
  ).filter((s) => WIZARD_STEPS.has(s));

  const sb = getServiceSupabase();
  if (sb && requested.length > 0) {
    // onboarding_progress JSON 에는 코치마크 투어(tours)·실스텝(completedSteps)이 함께 산다.
    // wizardSteps 키만 병합하고 나머지는 보존한다.
    const { data } = await sb
      .from("app_users")
      .select("onboarding_progress")
      .eq("email", email)
      .maybeSingle();
    const raw = data?.onboarding_progress;
    const base =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? { ...(raw as Record<string, unknown>) }
        : {};
    const wizardSteps = [...new Set([...readWizardSteps(raw), ...requested])];
    await sb
      .from("app_users")
      .update({ onboarding_progress: { ...base, wizardSteps } })
      .eq("email", email);
  }

  const verified = await getVerifiedOnboarding(email);
  return NextResponse.json({
    progress: { completedSteps: verified.completedSteps, completedAt: verified.completedAt },
    steps: verified.completedSteps,
    stored: Boolean(sb),
    bonusAwarded: verified.bonusAwarded,
  });
}
