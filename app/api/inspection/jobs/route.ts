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
/** 못 읽은 세션을 404 "세션 없음"으로 답하지 않기 위한 안내. */
const SESSION_UNAVAILABLE = "지금은 임장 기록을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";
/** 실행을 시작조차 못 한 것을 "작업 실패"로 답하지 않기 위한 안내. */
const JOB_UNAVAILABLE = "지금은 AI 작업을 실행할 수 없습니다. 잠시 후 다시 시도해 주세요.";

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
    /* 세션을 못 읽은 것을 "세션 없음"으로 답하면, 방금 만든 임장 세션에 AI를
       돌리려던 사용자에게 그 세션이 없다고 말하는 셈이 된다. */
    let row: Awaited<ReturnType<typeof getSession>>;
    try {
      row = await getSession(sessionId);
    } catch (err) {
      return dbUnavailable(`임장 세션 조회 실패 (id=${sessionId})`, err, SESSION_UNAVAILABLE);
    }
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

  /* 작업 행을 못 만들거나 실행 중 DB 가 끊기면 500 이 아니라 503 이다 — 500 은
     "우리 쪽이 망가졌다"라서 사용자가 다시 시도할 이유를 못 찾는다. */
  let result: Awaited<ReturnType<typeof processInspectionJob>>;
  try {
    const job = await createJob({
      sessionId,
      authorEmail: session.user.email,
      jobType,
      input: body.input && typeof body.input === "object" ? body.input : {},
    });
    result = await processInspectionJob(job);
  } catch (err) {
    return dbUnavailable(`AI 작업 실행 실패 (type=${jobType})`, err, JOB_UNAVAILABLE);
  }
  return NextResponse.json(
    { job: result },
    { status: result.status === "ready" ? 200 : result.status === "failed" ? 500 : 202 },
  );
}
