import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createJob, getSession } from "@/lib/inspection/session-store";
import { processInspectionJob } from "@/lib/inspection/job-runner";
import { checkReportQuota } from "@/lib/inspection/quota";
import { hasAccess, normalizePlanToGate, requirePlan } from "@/lib/subscriptions/access-gate";
import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import { dbUnavailable } from "@/lib/api/db-unavailable";

/** 조회가 실패한 것을 "0회 사용"으로 읽지 않기 위한 안내. */
const QUOTA_UNAVAILABLE = "지금은 사용량을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const jobType = body.jobType as "stt" | "vision" | "report" | "scenario";
  if (!["stt", "vision", "report", "scenario"].includes(jobType)) {
    return NextResponse.json({ error: "jobType invalid" }, { status: 400 });
  }
  const sessionId = body.sessionId ? String(body.sessionId) : undefined;
  if (sessionId) {
    const row = await getSession(sessionId);
    if (!row) return NextResponse.json({ error: "세션 없음" }, { status: 404 });
    if (row.authorEmail !== session.user.email) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const profile = await fetchAppUserByEmail(session.user.email);
  const plan = normalizePlanToGate(profile.plan);

  if (jobType === "report") {
    /* 사용량을 못 읽었으면 통과시키지 않는다 — 예전에는 조회 실패가 "0회 사용"
       으로 읽혀 한도가 통째로 풀렸다(AI 리포트는 호출마다 비용이 나간다). */
    let quota;
    try {
      quota = await checkReportQuota(session.user.email);
    } catch (err) {
      return dbUnavailable("AI 리포트 사용량 조회 실패", err, QUOTA_UNAVAILABLE);
    }
    if (!quota.allowed) {
      return NextResponse.json(
        { error: `월 AI 리포트 한도 초과 (${quota.used}/${quota.limit})`, quota },
        { status: 402 },
      );
    }
  }
  if (jobType === "scenario" && !hasAccess(plan, requirePlan("ai_deep_analysis"))) {
    return NextResponse.json({ error: "EXPERT 플랜이 필요합니다." }, { status: 402 });
  }

  const job = await createJob({
    sessionId,
    authorEmail: session.user.email,
    jobType,
    input: body.input && typeof body.input === "object" ? body.input : {},
  });

  const result = await processInspectionJob(job);
  return NextResponse.json(
    { job: result },
    { status: result.status === "ready" ? 200 : result.status === "failed" ? 500 : 202 },
  );
}
