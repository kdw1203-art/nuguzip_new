import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getVerifiedOnboarding } from "./verify";
import { logger } from "@/lib/log";

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

/* [965] /welcome 의 STEP_IDS 와 같은 다섯 개 — persona·demo 두 화면은 여기 없어서
   퍼널 기록에서 조용히 빠졌다(화면 5단계 중 3단계만 셈). */
const WIZARD_STEPS = new Set([
  "profile_region",
  "profile_budget",
  "profile_purpose",
  "profile_persona",
  "profile_demo",
]);

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
    const { data, error } = await sb
      .from("app_users")
      .select("onboarding_progress")
      .eq("email", email)
      .maybeSingle();
    /* 이 조회가 실패했는데 그대로 진행하면 base 가 {} 가 되고, 바로 아래 update 가
       그 빈 객체로 onboarding_progress 를 통째로 덮어쓴다 — 실스텝(completedSteps)과
       코치마크 투어(tours) 기록이 지워진다. 못 읽었으면 쓰지 않는다.
       (같은 패턴이 lib/onboarding/append-step.ts 에 이미 있다.) */
    if (error) {
      logger.error(
        `[me/onboarding] onboarding_progress 조회 실패 (${email}) — 위저드 진행을 저장하지 않았습니다.`,
        error,
      );
      return NextResponse.json(
        {
          error: "지금은 저장할 수 없어요. 잠시 후 다시 시도해 주세요.",
          stored: false,
        },
        { status: 503, headers: { "Retry-After": "30" } },
      );
    }
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
