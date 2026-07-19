import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession, createJob } from "@/lib/inspection/session-store";
import { processInspectionJob } from "@/lib/inspection/job-runner";
import { hasAccess, normalizePlanToGate, requirePlan } from "@/lib/subscriptions/access-gate";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const profile = await fetchAppUserByEmail(session.user.email);
  if (!hasAccess(normalizePlanToGate(profile.plan), requirePlan("investment_scenario"))) {
    return NextResponse.json({ error: "PRO 이상 플랜이 필요합니다." }, { status: 402 });
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = String(body.sessionId ?? "");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const row = await getSession(sessionId);
  if (!row || row.authorEmail !== session.user.email) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const job = await createJob({
    sessionId,
    authorEmail: session.user.email,
    jobType: "scenario",
    input: {
      currentPriceManwon: body.currentPriceManwon,
      holdingYears: body.holdingYears ?? 3,
    },
  });
  const result = await processInspectionJob(job);
  return NextResponse.json({ job: result, scenarios: result.output?.scenarios ?? [] });
}
