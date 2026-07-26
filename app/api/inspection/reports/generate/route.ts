import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession } from "@/lib/inspection/session-store";
import { createJob } from "@/lib/inspection/session-store";
import { processInspectionJob } from "@/lib/inspection/job-runner";
import { checkReportQuota } from "@/lib/inspection/quota";
import { recordFunnelEvent, FUNNEL_EVENT } from "@/lib/platform-funnel-events";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { logger } from "@/lib/log";

/** 조회가 실패한 것을 "0회 사용"으로 읽지 않기 위한 안내. */
const QUOTA_UNAVAILABLE = "지금은 사용량을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.";
/** 못 읽은 세션을 404 "세션 없음"으로 답하지 않기 위한 안내. */
const SESSION_UNAVAILABLE = "지금은 임장 기록을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";
/** 시작조차 못 한 생성을 500 "깨짐"으로 답하지 않기 위한 안내. */
const GENERATE_UNAVAILABLE = "지금은 AI 리포트를 만들 수 없습니다. 잠시 후 다시 시도해 주세요.";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/inspection/reports/generate — 종합 리포트 생성 (sessionId) */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const sessionId = String(body.sessionId ?? "");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  /* 세션을 못 읽은 것을 "세션 없음"으로 답하면, AI 리포트를 만들려던 사용자에게
     방금까지 쓰던 세션이 없다고 말하는 셈이 된다. */
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

  /* 사용량 조회 실패를 "0회 사용"으로 읽지 않는다 — /api/inspection/jobs 와 같다. */
  let quota;
  try {
    quota = await checkReportQuota(session.user.email);
  } catch (err) {
    return dbUnavailable("AI 리포트 사용량 조회 실패", err, QUOTA_UNAVAILABLE);
  }
  if (!quota.allowed) {
    return NextResponse.json({ error: "월 AI 리포트 한도 초과", quota }, { status: 402 });
  }

  /* 리포트 생성이 시작조차 못 된 경우다. 500 으로 답하면 사용자는 "만들다가
     깨졌다"로 읽지만, 실제로는 아직 아무것도 만들지 않았고 사용량도 안 깎였다. */
  let result: Awaited<ReturnType<typeof processInspectionJob>>;
  try {
    const job = await createJob({
      sessionId,
      authorEmail: session.user.email,
      jobType: "report",
      input: {
        publicDataSummary: body.publicDataSummary ?? "",
      },
    });
    result = await processInspectionJob(job);
  } catch (err) {
    return dbUnavailable(`AI 리포트 생성 실패 (id=${sessionId})`, err, GENERATE_UNAVAILABLE);
  }
  /* 여기서는 실패를 삼킨다. AI 리포트는 이미 만들어졌고 사용량도 차감됐다 —
     확인용 재조회 하나 때문에 전체를 실패로 답하면, 사용자는 돈만 쓰고 결과를
     못 받는다. 대신 report 는 null 로 내려가고(= 화면이 "아직 준비 중"으로
     그린다) 왜 못 읽었는지는 로그에 남긴다. 다시 열면 정상적으로 보인다. */
  const updated = await getSession(sessionId).then(
    (r) => r,
    (err: unknown) => {
      logger.error(`[reports/generate] 생성 후 세션 재조회 실패 (id=${sessionId})`, err);
      return null;
    },
  );

  if (updated?.structuredReport) {
    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.FIELD_AI_REPORT_COMPLETE,
      userEmail: session.user.email,
      path: "/api/inspection/reports/generate",
      metadata: {
        sessionId,
        overallScore: updated.structuredReport.scores?.overall,
      },
    });
  }

  return NextResponse.json({
    job: result,
    session: updated,
    report: updated?.structuredReport ?? null,
  });
}
