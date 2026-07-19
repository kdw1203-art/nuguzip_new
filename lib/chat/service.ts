import { getExpert } from "@/lib/experts/store-db";
import { getMeeting } from "@/lib/meetings/store-db";
import { enqueueEmailNotification } from "@/lib/notifications/outbox";
import { pushInboxNotification } from "@/lib/notifications/inbox";
import { checkAccess } from "@/lib/subscriptions/access";
import type { ChatReportStatus, ChatRoomType } from "@/lib/chat/types";
import {
  createBlock,
  createChatRoom,
  ensureRoomMembership,
  findGroupRoomIdByMeeting,
  getChatRoomByIdForUser,
  listBlocksForUser,
  listChatMessagesForRoom,
  listChatReportsForAdmin,
  listChatRoomMembers,
  listChatRoomsForUser,
  searchChatMessagesForUser,
  markChatRoomRead,
  removeBlock,
  reportChatMessage,
  sendChatMessage,
  softDeleteChatMessage,
  updateChatReportStatus,
  upsertChatPresence,
} from "@/lib/chat/store-db";

export type SessionActor = {
  email: string;
  role: "admin" | "user";
  plan: "free" | "pro" | "expert";
};

function toEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function assertMemberCap(memberEmails: string[]) {
  if (memberEmails.length < 2) throw new Error("CHAT_ROOM_MEMBER_MIN_TWO");
  if (memberEmails.length > 200) throw new Error("CHAT_ROOM_MEMBER_LIMIT");
}

export async function createRoomByPolicy(
  actor: SessionActor,
  input: {
    roomType: ChatRoomType;
    title?: string | null;
    memberEmails: string[];
    expertId?: string | null;
    meetingId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const actorEmail = toEmail(actor.email);
  const memberEmails = [...new Set(input.memberEmails.map(toEmail).filter(Boolean))];

  if (input.roomType === "direct") {
    assertMemberCap(memberEmails);
    if (memberEmails.length !== 2) throw new Error("DIRECT_ROOM_MEMBER_TWO_REQUIRED");
  }

  if (input.roomType === "expert") {
    const gate = checkAccess(actor.plan, "expert_consult");
    if (!gate.allowed) throw new Error("CHAT_EXPERT_PLAN_REQUIRED");
    if (!input.expertId) throw new Error("CHAT_EXPERT_ID_REQUIRED");
    const expert = await getExpert(input.expertId);
    if (!expert) throw new Error("CHAT_EXPERT_NOT_FOUND");
    if (memberEmails.length === 0) {
      memberEmails.push(actorEmail);
    }
    if (!memberEmails.some((e) => e.includes("@"))) {
      memberEmails.push(actorEmail);
    }
    if (memberEmails.length < 2) {
      memberEmails.push(`expert-${input.expertId}@chat.local`);
    }
    assertMemberCap(memberEmails);
  }

  if (input.roomType === "group") {
    if (!input.meetingId) throw new Error("CHAT_GROUP_MEETING_ID_REQUIRED");
    const meeting = await getMeeting(input.meetingId);
    if (!meeting) throw new Error("CHAT_GROUP_NOT_FOUND");
    if (memberEmails.length === 0) memberEmails.push(actorEmail);
    if (memberEmails.length < 2) {
      memberEmails.push(`group-${input.meetingId}@chat.local`);
    }
    assertMemberCap(memberEmails);
  }

  return createChatRoom({
    roomType: input.roomType,
    actorEmail,
    memberEmails,
    title: input.title ?? null,
    expertId: input.expertId ?? null,
    meetingId: input.meetingId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function listRoomsByPolicy(actor: SessionActor, keyword?: string) {
  return listChatRoomsForUser(actor.email, keyword);
}

/**
 * 모임 상세에서 호출 — 해당 모임의 그룹 채팅방을 찾거나 생성하고,
 * 현재 사용자를 멤버로 보장한 뒤 roomId 를 돌려준다 (idempotent).
 */
export async function getOrCreateGroupRoomByPolicy(
  actor: SessionActor,
  meetingId: string,
): Promise<{ roomId: string }> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) throw new Error("CHAT_GROUP_NOT_FOUND");

  const existingId = await findGroupRoomIdByMeeting(meetingId);
  if (existingId) {
    await ensureRoomMembership(existingId, actor.email);
    return { roomId: existingId };
  }

  const room = await createChatRoom({
    roomType: "group",
    actorEmail: toEmail(actor.email),
    memberEmails: [toEmail(actor.email), `group-${meetingId}@chat.local`],
    title: meeting.title ?? "모임 채팅",
    meetingId,
    metadata: {},
  });
  return { roomId: room.id };
}

export async function getRoomThreadByPolicy(
  actor: SessionActor,
  roomId: string,
  options?: { limit?: number; before?: string; q?: string },
) {
  const room = await getChatRoomByIdForUser(roomId, actor.email);
  if (!room) throw new Error("CHAT_ROOM_FORBIDDEN");
  const [members, messages] = await Promise.all([
    listChatRoomMembers(roomId, actor.email),
    listChatMessagesForRoom(roomId, actor.email, options),
  ]);
  return { room, members, messages };
}

export async function sendMessageByPolicy(
  actor: SessionActor,
  input: {
    roomId: string;
    body?: string | null;
    messageType?: "text" | "file" | "system";
    attachments?: Array<{
      fileUrl: string;
      filePath?: string | null;
      mime?: string | null;
      sizeBytes?: number;
    }>;
  },
) {
  if (input.messageType === "system" && actor.role !== "admin") {
    throw new Error("CHAT_SYSTEM_MESSAGE_FORBIDDEN");
  }
  const room = await getChatRoomByIdForUser(input.roomId, actor.email);
  if (!room) throw new Error("CHAT_ROOM_FORBIDDEN");

  const textBody = input.body?.trim() ?? "";
  if (room.roomType === "expert" && textBody) {
    const { scanExpertConversationText, hasBlockingFraudHit } = await import(
      "@/lib/experts/fraud-guards"
    );
    const { logExpertFraudEvent } = await import("@/lib/experts/verification-store");
    const hits = scanExpertConversationText(textBody);
    if (hits.length > 0) {
      const top = hits[0]!;
      void logExpertFraudEvent({
        userEmail: actor.email,
        expertId: room.expertId,
        eventType: top.ruleId,
        severity: top.severity,
        context: { roomId: input.roomId, preview: textBody.slice(0, 200) },
      });
      if (hasBlockingFraudHit(hits)) {
        throw new Error("CHAT_OFF_PLATFORM_BLOCKED");
      }
    }
  }

  const message = await sendChatMessage({
    roomId: input.roomId,
    senderEmail: actor.email,
    body: input.body ?? null,
    messageType: input.messageType ?? "text",
    attachments: input.attachments ?? [],
  });
  const members = await listChatRoomMembers(input.roomId, actor.email);
  const sender = toEmail(actor.email);
  const recipients = members
    .map((m) => toEmail(m.userEmail))
    .filter((email) => email !== sender && !email.endsWith("@chat.local"));
  const preview =
    message.body?.slice(0, 120) ??
    (message.attachments.length > 0 ? "첨부 파일이 도착했습니다." : "새 메시지가 도착했습니다.");
  for (const email of recipients) {
    // 인앱 알림은 실시간성, 이메일 outbox는 백오프 전송용
    await pushInboxNotification({
      userEmail: email,
      title: "새 채팅 메시지",
      body: preview,
      actionUrl: `/chat?room=${input.roomId}`,
    });
    await enqueueEmailNotification({
      to: email,
      subject: "[우리동네이야기] 새 채팅 메시지",
      body: preview,
      metadata: { roomId: input.roomId, messageId: message.id, from: sender },
    });
  }
  return message;
}

export async function readRoomByPolicy(
  actor: SessionActor,
  roomId: string,
  lastReadMessageId: string | null,
) {
  const ok = await markChatRoomRead(roomId, actor.email, lastReadMessageId);
  if (!ok) throw new Error("CHAT_ROOM_READ_FORBIDDEN");
  await upsertChatPresence({
    userEmail: actor.email,
    roomId,
    isOnline: true,
  });
  return { ok: true };
}

export async function reportMessageByPolicy(
  actor: SessionActor,
  input: { messageId: string; reason: string },
) {
  return reportChatMessage({
    messageId: input.messageId,
    reporterEmail: actor.email,
    reason: input.reason,
  });
}

export async function deleteMessageByPolicy(actor: SessionActor, messageId: string) {
  const ok = await softDeleteChatMessage(messageId, actor.email, actor.role === "admin");
  if (!ok) throw new Error("CHAT_MESSAGE_DELETE_FORBIDDEN");
  return { ok: true };
}

export async function blockUserByPolicy(
  actor: SessionActor,
  blockedEmail: string,
  reason?: string | null,
) {
  return createBlock({
    blockerEmail: actor.email,
    blockedEmail,
    reason: reason ?? null,
  });
}

export async function unblockUserByPolicy(actor: SessionActor, blockedEmail: string) {
  return removeBlock(actor.email, blockedEmail);
}

export async function listBlocksByPolicy(actor: SessionActor) {
  return listBlocksForUser(actor.email);
}

export async function searchMessagesByPolicy(
  actor: SessionActor,
  q: string,
  roomId?: string,
) {
  return searchChatMessagesForUser(actor.email, q, { roomId, limit: 60 });
}

export async function updatePresenceByPolicy(
  actor: SessionActor,
  roomId: string | null,
  isOnline: boolean,
) {
  await upsertChatPresence({
    userEmail: actor.email,
    roomId,
    isOnline,
  });
  return { ok: true };
}

export async function listReportsByAdminPolicy(
  actor: SessionActor,
  status: ChatReportStatus | "all",
) {
  if (actor.role !== "admin") throw new Error("CHAT_REPORT_ADMIN_ONLY");
  return listChatReportsForAdmin(status);
}

export async function updateReportByAdminPolicy(
  actor: SessionActor,
  reportId: string,
  status: ChatReportStatus,
) {
  if (actor.role !== "admin") throw new Error("CHAT_REPORT_ADMIN_ONLY");
  const ok = await updateChatReportStatus({
    reportId,
    status,
    handledByEmail: actor.email,
  });
  if (!ok) throw new Error("CHAT_REPORT_UPDATE_FAILED");
  return { ok: true };
}
