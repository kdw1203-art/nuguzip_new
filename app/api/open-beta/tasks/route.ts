import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { summarizeGate, type GateStatus } from "@/lib/open-beta/checklist";
import {
  listOpenBetaTasksResolved,
  updateOpenBetaTaskResolved,
  type OpenBetaTaskPatch,
} from "@/lib/open-beta/task-store";

export const runtime = "nodejs";

const STATUSES: GateStatus[] = ["todo", "doing", "done", "blocked"];

function requireAdmin() {
  return auth().then((session) => {
    const role = (session?.user as { role?: string })?.role;
    if (!session?.user?.email || role !== "admin") {
      return null;
    }
    return session;
  });
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  try {
    const taskList = await listOpenBetaTasksResolved();
    const summary = summarizeGate(taskList);
    return NextResponse.json({ tasks: taskList, summary });
  } catch (e) {
    return NextResponse.json(
      { error: "OPEN_BETA_TASKS_FETCH_FAILED", detail: String(e) },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const id = String(body.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const statusRaw = body.status;
  if (statusRaw !== undefined && !STATUSES.includes(statusRaw as GateStatus)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const patch: OpenBetaTaskPatch = {};
  if (statusRaw !== undefined) patch.status = statusRaw as GateStatus;
  if (body.owner !== undefined) patch.owner = String(body.owner);
  if (body.dueDate !== undefined) patch.dueDate = String(body.dueDate);
  if (body.note !== undefined) patch.note = String(body.note);

  try {
    const updated = await updateOpenBetaTaskResolved(id, patch);
    if (!updated) {
      return NextResponse.json({ error: "not found or no patch" }, { status: 404 });
    }

    const taskList = await listOpenBetaTasksResolved();
    const summary = summarizeGate(taskList);
    return NextResponse.json({ updated, summary });
  } catch (e) {
    return NextResponse.json(
      { error: "OPEN_BETA_TASKS_PATCH_FAILED", detail: String(e) },
      { status: 500 },
    );
  }
}
