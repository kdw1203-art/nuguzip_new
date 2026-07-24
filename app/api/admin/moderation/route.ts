/**
 * PATCH /api/admin/moderation
 * 관리자 전용. 신고 1건의 처리 상태를 바꾼다.
 * content_reports / chat_reports 두 소스를 하나의 엔드포인트로 처리한다.
 *
 * body: { source: "content"|"chat", id: string, status: "reviewed"|"dismissed"|"actioned"|"open", note?: string }
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { updateContentReportStatus, type ReportStatus } from "@/lib/moderation/reports-store";
import { updateChatReportStatus } from "@/lib/chat/store-db";
import type { ChatReportStatus } from "@/lib/chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAT_STATUSES = ["open", "reviewed", "dismissed", "actioned"] as const;
const CONTENT_STATUSES = ["open", "reviewed", "dismissed"] as const;

export async function PATCH(req: Request) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email || session.user.role !== "admin") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const source = String(body.source ?? "");
  const id = String(body.id ?? "").trim();
  const status = String(body.status ?? "").trim();
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  if (!id) return NextResponse.json({ error: "id 가 필요합니다." }, { status: 400 });

  if (source === "content") {
    if (!(CONTENT_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: "유효하지 않은 status" }, { status: 400 });
    }
    const res = await updateContentReportStatus(id, status as ReportStatus, note);
    if (!res.ok) {
      return NextResponse.json({ error: res.error ?? "갱신 실패" }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  }

  if (source === "chat") {
    if (!(CHAT_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: "유효하지 않은 status" }, { status: 400 });
    }
    const ok = await updateChatReportStatus({
      reportId: id,
      status: status as ChatReportStatus,
      handledByEmail: email,
    });
    if (!ok) return NextResponse.json({ error: "갱신 실패" }, { status: 503 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "source 는 content 또는 chat 이어야 합니다." }, { status: 400 });
}
