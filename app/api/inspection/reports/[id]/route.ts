import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession, updateSession } from "@/lib/inspection/session-store";
import type { StructuredReport } from "@/lib/inspection/ontology";
import { syncSessionToInspectionNote } from "@/lib/inspection/session-note-bridge";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 못 읽은 리포트를 404 "없음"으로 답하지 않기 위한 안내. */
const REPORT_UNAVAILABLE = "지금은 리포트를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";
const SAVE_UNAVAILABLE = "지금은 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.";

type Ctx = { params: Promise<{ id: string }> };

/** id = sessionId */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await ctx.params;
  let row: Awaited<ReturnType<typeof getSession>>;
  try {
    row = await getSession(id);
  } catch (err) {
    return dbUnavailable(`임장 리포트 조회 실패 (id=${id})`, err, REPORT_UNAVAILABLE);
  }
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.authorEmail !== session.user.email) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    sessionId: id,
    version: row.reportVersion,
    status: row.structuredReport ? "ready" : "pending",
    report: row.structuredReport,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await ctx.params;
  let row: Awaited<ReturnType<typeof getSession>>;
  try {
    row = await getSession(id);
  } catch (err) {
    return dbUnavailable(`임장 리포트 조회 실패 (id=${id})`, err, REPORT_UNAVAILABLE);
  }
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.authorEmail !== session.user.email) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (!body.report || typeof body.report !== "object") {
    return NextResponse.json({ error: "report object required" }, { status: 400 });
  }
  /* 사용자가 손으로 고친 리포트다. 저장 실패를 200 으로 답하면 화면은 저장된
     것으로 넘어가고, 고친 내용은 그대로 사라진다. */
  let updated: Awaited<ReturnType<typeof updateSession>>;
  try {
    updated = await updateSession(id, {
      structuredReport: body.report as StructuredReport,
      reportVersion: row.reportVersion + 1,
      metadata: {
        ...row.metadata,
        lastEditedAt: new Date().toISOString(),
        editDiff: body.editNote ?? "user_edit",
      },
    });
  } catch (err) {
    return dbUnavailable(`임장 리포트 저장 실패 (id=${id})`, err, SAVE_UNAVAILABLE);
  }
  /* 저장은 이미 끝났다. 노트 연동은 부가 작업이라, 여기서 실패했다고 전체를
     오류로 답하면 사용자는 "저장 실패"로 읽고 같은 내용을 또 고친다. 연동 실패는
     로그로 남기고 저장 결과는 그대로 돌려준다. */
  const linked = updated
    ? await syncSessionToInspectionNote(id).then(
        (r) => r,
        (err: unknown) => {
          logger.error(`[reports/${id}] 임장노트 연동 실패`, err);
          return null;
        },
      )
    : null;
  return NextResponse.json({
    session: updated,
    report: updated?.structuredReport,
    noteId: linked?.noteId ?? updated?.noteId ?? null,
  });
}
