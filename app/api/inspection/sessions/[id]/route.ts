import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getSession,
  updateSession,
  listSessionMedia,
} from "@/lib/inspection/session-store";
import type { StructuredReport } from "@/lib/inspection/ontology";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function assertOwner(sessionId: string, email: string) {
  const row = await getSession(sessionId);
  if (!row) return { error: NextResponse.json({ error: "not found" }, { status: 404 }), row: null };
  if (row.authorEmail !== email) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }), row: null };
  }
  return { error: null, row };
}

export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const { error, row } = await assertOwner(id, session.user.email);
  if (error || !row) return error!;
  const media = await listSessionMedia(id);
  return NextResponse.json({ session: row, media });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const { error, row } = await assertOwner(id, session.user.email);
  if (error || !row) return error!;

  const body = await req.json().catch(() => ({}));
  const patch: Parameters<typeof updateSession>[1] = {};

  if (body.status) patch.status = body.status;
  if (body.capture && typeof body.capture === "object") {
    patch.capture = { ...row.capture, ...body.capture };
  }
  if (body.structuredReport !== undefined) {
    patch.structuredReport = body.structuredReport as StructuredReport | null;
    patch.reportVersion = row.reportVersion + 1;
  }
  if (body.endSession === true) {
    patch.status = "completed";
    patch.endedAt = new Date().toISOString();
  }
  if (body.lens && typeof body.lens === "string") {
    const { LENS_OPTIONS } = await import("@/lib/inspection/field-labels");
    const opt = LENS_OPTIONS.find((o) => o.id === body.lens);
    if (opt) {
      patch.mode = opt.mode;
      patch.metadata = { ...row.metadata, lens: opt.id };
    }
  } else if (body.metadata && typeof body.metadata === "object") {
    patch.metadata = { ...row.metadata, ...body.metadata };
  }

  const updated = await updateSession(id, patch);
  return NextResponse.json({ session: updated });
}
