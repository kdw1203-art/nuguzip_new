import { NextResponse } from "next/server";
import {
  type ReportStatus,
  updateContentReportStatus,
} from "@/lib/moderation/reports-store";
import { safeAuth } from "@/lib/safe-auth";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await safeAuth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const status = String(b.status ?? "").trim() as ReportStatus;
  const adminNote =
    typeof b.adminNote === "string" ? b.adminNote.trim() || null : null;
  if (!["open", "reviewed", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "유효하지 않은 status" }, { status: 400 });
  }
  const res = await updateContentReportStatus(id, status, adminNote);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error ?? "갱신 실패" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}
