import { NextRequest } from "next/server";
import { ok, apiError } from "@/lib/api/response";
import { applyRateLimit, READ_RATE_LIMIT, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";
import { createRoomByPolicy, listRoomsByPolicy } from "@/lib/chat/service";
import { requireChatActor, toErrorResponse } from "@/app/api/chat/_shared";
import { chatAliasId } from "@/lib/chat/pseudonym";
import type { ChatRoomSummary, ChatRoomType } from "@/lib/chat/types";

/** 이메일 필드를 가명으로 바꾼 방 요약 — 응답 전용 (lib/chat/pseudonym.ts 참고) */
function sanitizeRoom(room: ChatRoomSummary) {
  return {
    id: room.id,
    roomType: room.roomType,
    title: room.title,
    status: room.status,
    expertId: room.expertId,
    meetingId: room.meetingId,
    lastMessageAt: room.lastMessageAt,
    lastMessagePreview: room.lastMessagePreview,
    lastSenderId: room.lastSenderEmail ? chatAliasId(room.lastSenderEmail) : null,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    memberCount: room.memberCount,
    unreadCount: room.unreadCount,
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;
  const { actor, error } = await requireChatActor();
  if (error || !actor) return error;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const rooms = await listRoomsByPolicy(actor, q);
  /* createdByEmail·lastSenderEmail 을 브라우저로 보내지 않는다. */
  return ok({ ok: true, rooms: rooms.map(sanitizeRoom) });
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
    return ok({ ok: true, room: sanitizeRoom(room) }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
