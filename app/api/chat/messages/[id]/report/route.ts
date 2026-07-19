import { NextRequest } from "next/server";
import { ok, apiError } from "@/lib/api/response";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { reportMessageByPolicy } from "@/lib/chat/service";
import { requireChatActor, toErrorResponse } from "@/app/api/chat/_shared";
import { recordPlatformEvent } from "@/lib/platform-events";
import { detectShellFromUserAgent } from "@/lib/platform-shell";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = String(body.reason ?? "").trim();
  if (!reason || reason.length < 3) {
    return apiError("INVALID_REASON", "신고 사유를 3자 이상 입력해 주세요.", 400);
  }
  try {
    const report = await reportMessageByPolicy(actor, { messageId: id, reason });
    const platform = detectShellFromUserAgent(req.headers.get("user-agent"));
    void recordPlatformEvent({
      platform,
      eventName: "chat_report_create",
      userEmail: actor.email,
      path: `/api/chat/messages/${id}/report`,
      source: "server_api",
      campaign: "chat",
      metadata: { reportId: report.id, messageId: id },
    });
    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.CHAT_REPORT_CREATE,
      userEmail: actor.email,
      path: `/api/chat/messages/${id}/report`,
      metadata: { reportId: report.id, messageId: id },
    });
    return ok({ ok: true, report }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
