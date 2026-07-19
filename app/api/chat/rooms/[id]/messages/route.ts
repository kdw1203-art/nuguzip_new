import { NextRequest } from "next/server";
import { ok, apiError } from "@/lib/api/response";
import { applyRateLimit, READ_RATE_LIMIT, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { getRoomThreadByPolicy, sendMessageByPolicy } from "@/lib/chat/service";
import { requireChatActor, toErrorResponse } from "@/app/api/chat/_shared";
import { recordPlatformEvent } from "@/lib/platform-events";
import { detectShellFromUserAgent } from "@/lib/platform-shell";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;

  const { id } = await params;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const before = req.nextUrl.searchParams.get("before") ?? undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  try {
    const thread = await getRoomThreadByPolicy(actor, id, { q, before, limit });
    return ok({ ok: true, ...thread });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return apiError("INVALID_JSON", "JSON 본문이 필요합니다.", 400);
  }

  const attachments = Array.isArray(body.attachments)
    ? body.attachments.map((a) => {
        const item = a as Record<string, unknown>;
        return {
          fileUrl: String(item.fileUrl ?? ""),
          filePath: item.filePath ? String(item.filePath) : null,
          mime: item.mime ? String(item.mime) : null,
          sizeBytes: Number(item.sizeBytes ?? 0),
        };
      })
    : [];

  try {
    const message = await sendMessageByPolicy(actor, {
      roomId: id,
      body: body.body ? String(body.body) : null,
      messageType: body.messageType as "text" | "file" | "system" | undefined,
      attachments,
    });
    const platform = detectShellFromUserAgent(req.headers.get("user-agent"));
    void recordPlatformEvent({
      platform,
      eventName: "chat_message_send",
      userEmail: actor.email,
      source: "server_api",
      campaign: "chat",
      path: `/api/chat/rooms/${id}/messages`,
      metadata: { roomId: id, messageId: message.id, attachmentCount: attachments.length },
    });
    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.CHAT_MESSAGE_SEND,
      userEmail: actor.email,
      path: `/api/chat/rooms/${id}/messages`,
      metadata: { roomId: id, messageId: message.id, attachmentCount: attachments.length },
    });
    return ok({ ok: true, message }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
