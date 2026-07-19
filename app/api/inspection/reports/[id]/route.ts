import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSession, updateSession } from "@/lib/inspection/session-store";
import type { StructuredReport } from "@/lib/inspection/ontology";
import { syncSessionToInspectionNote } from "@/lib/inspection/session-note-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** id = sessionId */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const row = await getSession(id);
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
  const row = await getSession(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.authorEmail !== session.user.email) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (!body.report || typeof body.report !== "object") {
    return NextResponse.json({ error: "report object required" }, { status: 400 });
  }
  const updated = await updateSession(id, {
    structuredReport: body.report as StructuredReport,
    reportVersion: row.reportVersion + 1,
    metadata: {
      ...row.metadata,
      lastEditedAt: new Date().toISOString(),
      editDiff: body.editNote ?? "user_edit",
    },
  });
  const linked = updated ? await syncSessionToInspectionNote(id) : null;
  return NextResponse.json({
    session: updated,
    report: updated?.structuredReport,
    noteId: linked?.noteId ?? updated?.noteId ?? null,
  });
}
