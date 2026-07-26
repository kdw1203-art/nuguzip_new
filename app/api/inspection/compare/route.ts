import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession } from "@/lib/inspection/session-store";
import { compareSessions } from "@/lib/inspection/compare-scenario";
import { hasAccess, normalizePlanToGate, requirePlan } from "@/lib/subscriptions/access-gate";
import { canUseFeatureTrial, consumeFeatureTrial } from "@/lib/subscriptions/feature-trial";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import { dbUnavailable } from "@/lib/api/db-unavailable";

/** 조회가 실패한 것을 "체험을 아직 안 썼다"로 읽지 않기 위한 안내. */
const TRIAL_UNAVAILABLE = "지금은 이용 권한을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const profile = await fetchAppUserByEmail(session.user.email);
  const plan = normalizePlanToGate(profile.plan);
  const feature = requirePlan("compare_board");
  if (!hasAccess(plan, feature)) {
    /* 체험 기록 조회가 실패하면 열어 주지 않는다 — 예전에는 실패가 "아직 안 씀"
       으로 읽혀 무료 체험이 몇 번이든 다시 열렸다. */
    let trialOk: boolean;
    try {
      trialOk = await canUseFeatureTrial(session.user.email, "compare");
    } catch (err) {
      return dbUnavailable("체험 사용 기록 조회 실패 (compare)", err, TRIAL_UNAVAILABLE);
    }
    if (!trialOk) {
      return NextResponse.json({ error: "PRO 이상 플랜이 필요합니다." }, { status: 402 });
    }
    await consumeFeatureTrial(session.user.email, "compare");
  }

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.sessionIds) ? body.sessionIds.map(String) : [];
  if (ids.length < 2) {
    return NextResponse.json({ error: "sessionIds 2개 이상 필요" }, { status: 400 });
  }

  const rows = [];
  for (const id of ids.slice(0, 5)) {
    const row = await getSession(id);
    if (row && row.authorEmail === session.user.email) rows.push(row);
  }
  if (rows.length < 2) {
    return NextResponse.json({ error: "비교 가능한 세션이 부족합니다." }, { status: 400 });
  }

  return NextResponse.json({ compare: compareSessions(rows) });
}
