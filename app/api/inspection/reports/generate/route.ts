import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession } from "@/lib/inspection/session-store";
import { createJob } from "@/lib/inspection/session-store";
import { processInspectionJob } from "@/lib/inspection/job-runner";
import { checkReportQuota } from "@/lib/inspection/quota";
import { recordFunnelEvent, FUNNEL_EVENT } from "@/lib/platform-funnel-events";

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

  const quota = await checkReportQuota(session.user.email);
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
