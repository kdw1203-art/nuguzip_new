import { NextRequest } from "next/server";
import { ok, apiError } from "@/lib/api/response";
import { applyRateLimit, READ_RATE_LIMIT, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { blockUserByPolicy, listBlocksByPolicy, unblockUserByPolicy } from "@/lib/chat/service";
import { requireChatActor, toErrorResponse } from "@/app/api/chat/_shared";
import { recordPlatformEvent } from "@/lib/platform-events";
import { detectShellFromUserAgent } from "@/lib/platform-shell";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const blocks = await listBlocksByPolicy(actor);
  return ok({ ok: true, blocks });
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const body = (await req.json().catch(() => ({}))) as { blockedEmail?: string; reason?: string };
  const blockedEmail = String(body.blockedEmail ?? "").trim().toLowerCase();
  if (!blockedEmail || !blockedEmail.includes("@")) {
    return apiError("INVALID_BLOCKED_EMAIL", "blockedEmail 형식이 올바르지 않습니다.", 400);
  }
  try {
    const block = await blockUserByPolicy(actor, blockedEmail, body.reason ?? null);
    const platform = detectShellFromUserAgent(req.headers.get("user-agent"));
    void recordPlatformEvent({
      platform,
      eventName: "chat_block_user",
      userEmail: actor.email,
      source: "server_api",
      campaign: "chat",
      path: "/api/chat/blocks",
      metadata: { blockedEmail },
    });
    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.CHAT_BLOCK_USER,
      userEmail: actor.email,
      path: "/api/chat/blocks",
      metadata: { blockedEmail },
    });
    return ok({ ok: true, block }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const body = (await req.json().catch(() => ({}))) as { blockedEmail?: string };
  const blockedEmail = String(body.blockedEmail ?? "").trim().toLowerCase();
  if (!blockedEmail || !blockedEmail.includes("@")) {
    return apiError("INVALID_BLOCKED_EMAIL", "blockedEmail 형식이 올바르지 않습니다.", 400);
  }
  const okResult = await unblockUserByPolicy(actor, blockedEmail);
  return ok({ ok: okResult, blockedEmail });
}
