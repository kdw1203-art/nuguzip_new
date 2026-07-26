import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getSession,
  updateSession,
  listSessionMedia,
} from "@/lib/inspection/session-store";
import type { StructuredReport } from "@/lib/inspection/ontology";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 못 읽은 세션을 404 "없음"으로 답하지 않기 위한 안내. */
const SESSION_UNAVAILABLE = "지금은 임장 기록을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";
const SAVE_UNAVAILABLE = "지금은 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 소유자 확인. getSession 은 조회에 실패하면 **던진다** — 여기서 잡지 않고
 * 그대로 올려 보내, 부르는 쪽이 404(없음)가 아니라 503(지금 못 읽음)으로
 * 답하게 한다. 404 로 접으면 사용자는 자기 임장노트가 지워졌다고 읽는다.
 */
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
  try {
    const { error, row } = await assertOwner(id, session.user.email);
    if (error || !row) return error!;
    const media = await listSessionMedia(id);
    return NextResponse.json({ session: row, media });
  } catch (err) {
    return dbUnavailable(`임장 세션 조회 실패 (id=${id})`, err, SESSION_UNAVAILABLE);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await ctx.params;
  let row: NonNullable<Awaited<ReturnType<typeof assertOwner>>["row"]>;
  try {
    const owned = await assertOwner(id, session.user.email);
    if (owned.error || !owned.row) return owned.error!;
    row = owned.row;
  } catch (err) {
    return dbUnavailable(`임장 세션 조회 실패 (id=${id})`, err, SESSION_UNAVAILABLE);
  }

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

  /* 저장 실패를 200 으로 답하면 화면은 저장된 것으로 넘어간다 — 현장에서 적은
     내용은 다시 만들 수 없으므로, 못 저장했으면 못 저장했다고 답한다. */
  try {
    const updated = await updateSession(id, patch);
    return NextResponse.json({ session: updated });
  } catch (err) {
    return dbUnavailable(`임장 세션 저장 실패 (id=${id})`, err, SAVE_UNAVAILABLE);
  }
}
