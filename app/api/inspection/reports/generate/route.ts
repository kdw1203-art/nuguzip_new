import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession } from "@/lib/inspection/session-store";
import { createJob } from "@/lib/inspection/session-store";
import { processInspectionJob } from "@/lib/inspection/job-runner";
import { checkReportQuota } from "@/lib/inspection/quota";
import { recordFunnelEvent, FUNNEL_EVENT } from "@/lib/platform-funnel-events";
import { dbUnavailable } from "@/lib/api/db-unavailable";

/** 조회가 실패한 것을 "0회 사용"으로 읽지 않기 위한 안내. */
const QUOTA_UNAVAILABLE = "지금은 사용량을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.";

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

  const row = await getSession(sessionId);
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

  const job = await createJob({
    sessionId,
    authorEmail: session.user.email,
    jobType: "report",
    input: {
      publicDataSummary: body.publicDataSummary ?? "",
    },
  });
  const result = await processInspectionJob(job);
  const updated = await getSession(sessionId);

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
