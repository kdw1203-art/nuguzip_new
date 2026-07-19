import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession } from "@/lib/inspection/session-store";
import { compareSessions } from "@/lib/inspection/compare-scenario";
import { hasAccess, normalizePlanToGate, requirePlan } from "@/lib/subscriptions/access-gate";
import { canUseFeatureTrial, consumeFeatureTrial } from "@/lib/subscriptions/feature-trial";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";

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
    const trialOk = await canUseFeatureTrial(session.user.email, "compare");
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
