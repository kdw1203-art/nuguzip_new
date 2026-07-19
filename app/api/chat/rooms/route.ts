import { NextRequest } from "next/server";
import { ok, apiError } from "@/lib/api/response";
import { applyRateLimit, READ_RATE_LIMIT, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";
import { createRoomByPolicy, listRoomsByPolicy } from "@/lib/chat/service";
import { requireChatActor, toErrorResponse } from "@/app/api/chat/_shared";
import type { ChatRoomType } from "@/lib/chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const rooms = await listRoomsByPolicy(actor, q);
  return ok({ ok: true, rooms });
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return apiError("INVALID_JSON", "JSON 본문이 필요합니다.", 400);
  }

  const roomType = String(body.roomType ?? "").trim() as ChatRoomType;
  if (!["direct", "expert", "group"].includes(roomType)) {
    return apiError("INVALID_ROOM_TYPE", "roomType은 direct/expert/group 중 하나여야 합니다.", 400);
  }
  const memberEmails = Array.isArray(body.memberEmails)
    ? body.memberEmails.map((v) => String(v ?? "").trim().toLowerCase()).filter(Boolean)
    : [];
  if (memberEmails.length < 1 && roomType === "direct") {
    return apiError("MEMBERS_REQUIRED", "memberEmails가 필요합니다.", 400);
  }

  try {
    const room = await createRoomByPolicy(actor, {
      roomType,
      title: body.title ? String(body.title) : null,
      memberEmails,
      expertId: body.expertId ? String(body.expertId) : null,
      meetingId: body.meetingId ? String(body.meetingId) : null,
      metadata: (body.metadata as Record<string, unknown> | undefined) ?? {},
    });
    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.CHAT_ROOM_OPEN,
      userEmail: actor.email,
      path: "/api/chat/rooms",
      metadata: { chatEvent: "chat_room_open", roomType, roomId: room.id },
    });
    return ok({ ok: true, room }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
