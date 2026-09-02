import { getExpert } from "@/lib/experts/store-db";
import { getMeeting, joinMeeting, type UserMeeting } from "@/lib/meetings/store-db";
import { enqueueEmailNotification } from "@/lib/notifications/outbox";
import { pushInboxNotification } from "@/lib/notifications/inbox";
import { getPrefs } from "@/lib/notification-prefs/store-db";
import { checkAccess } from "@/lib/subscriptions/access";
import type { ChatReportStatus, ChatRoomType } from "@/lib/chat/types";
import {
  createBlock,
  createChatRoom,
  ensureRoomMembership,
  findGroupRoomIdByMeeting,
  getChatRoomByIdForUser,
  hasRoomMembershipRecord,
  leaveChatRoom,
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

/** 모임 status·정원 검사 — 신규 입장자에게만 적용(기존 멤버·주최자는 통과). */
function assertMeetingJoinable(meeting: UserMeeting) {
  if (meeting.status === "cancelled") throw new Error("CHAT_GROUP_CANCELLED");
  if (meeting.status !== "open") throw new Error("CHAT_GROUP_CLOSED");
  if (meeting.currentMembers >= meeting.maxMembers) throw new Error("CHAT_GROUP_FULL");
}

/** joinMeeting 실패 메시지를 채팅 에러 코드로 변환해 throw. Supabase 미설정은 통과(개발 폴백). */
function throwFromJoinFailure(message?: string): void {
  if (!message || message === "Supabase 미설정") return;
  if (message.includes("정원")) throw new Error("CHAT_GROUP_FULL");
  if (message.includes("취소")) throw new Error("CHAT_GROUP_CANCELLED");
  if (message.includes("마감")) throw new Error("CHAT_GROUP_CLOSED");
  throw new Error("CHAT_GROUP_CLOSED");
}

/**
 * 모임 상세에서 호출 — 해당 모임의 그룹 채팅방을 찾거나 생성하고,
 * 현재 사용자를 멤버로 보장한 뒤 roomId 를 돌려준다 (idempotent).
 *
 * 정원·상태 실집행(#4): 신규 입장자는 status=open + 정원 검사를 통과해야 하고,
 * 통과 시 joinMeeting() 으로 current_members 를 증가시킨다. 이미 채팅방 멤버면
 * 어떤 검사·증가도 없이 그대로 재입장한다(멱등). 주최자는 개설 시점에 이미
 * current_members=1 로 집계돼 있으므로 증가시키지 않는다.
 */
export async function getOrCreateGroupRoomByPolicy(
  actor: SessionActor,
  meetingId: string,
): Promise<{ roomId: string }> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) throw new Error("CHAT_GROUP_NOT_FOUND");

  const actorEmail = toEmail(actor.email);
  const isOrganizer = toEmail(meeting.organizerEmail || "") === actorEmail;

  const existingId = await findGroupRoomIdByMeeting(meetingId);
  if (existingId) {
    // 나갔다 돌아온 사용자도 이미 정원에 집계돼 있으므로(멱등) 증가·검사 없이 재입장
    const alreadyCounted = await hasRoomMembershipRecord(existingId, actorEmail);
    if (!alreadyCounted && !isOrganizer) {
      assertMeetingJoinable(meeting);
      const joined = await joinMeeting(meetingId, actorEmail);
      if (!joined.ok) throwFromJoinFailure(joined.message);
    }
    await ensureRoomMembership(existingId, actorEmail);
    return { roomId: existingId };
  }

  if (!isOrganizer) {
    assertMeetingJoinable(meeting);
    const joined = await joinMeeting(meetingId, actorEmail);
    if (!joined.ok) throwFromJoinFailure(joined.message);
  }

  const room = await createChatRoom({
    roomType: "group",
    actorEmail,
    memberEmails: [actorEmail, `group-${meetingId}@chat.local`],
    title: meeting.title ?? "모임 채팅",
    meetingId,
    metadata: {},
  });
  return { roomId: room.id };
}

/** 방 나가기 — 멤버가 아니면 403. */
export async function leaveRoomByPolicy(actor: SessionActor, roomId: string) {
  const left = await leaveChatRoom(roomId, actor.email);
  if (!left) throw new Error("CHAT_ROOM_FORBIDDEN");
  return { ok: true };
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

/* ---------- 클라이언트 전송용 가명 변환 (lib/chat/pseudonym.ts 주석 참고) ----------
   원본 이메일은 서버 안(저장·알림·차단 집행)에서만 쓰고, 브라우저로 나가는
   응답에는 가명 ID·표시명만 싣는다. F12 네트워크 탭에 같은 방 참여자 전원의
   이메일이 보이던 유출 경로를 전송 경계에서 끊는다. */

export type ClientRoomMember = {
  /** 가명 ID — 차단 등 지목 요청에 쓴다 (이메일 아님) */
  id: string;
  label: string;
  role: "owner" | "member" | "moderator";
  isSelf: boolean;
};

export type ClientChatMessage = {
  id: string;
  senderId: string;
  senderLabel: string;
  isMine: boolean;
  body: string | null;
  messageType: "text" | "file" | "system";
  createdAt: string;
  attachments: Array<{ id: string; fileUrl: string; mime: string | null; sizeBytes: number }>;
};

/** 스레드를 가명으로 변환해 돌려준다 — GET /api/chat/rooms/[id]/messages 전용. */
export async function getRoomThreadForClientByPolicy(
  actor: SessionActor,
  roomId: string,
  options?: { limit?: number; before?: string; q?: string },
): Promise<{
  room: {
    id: string;
    roomType: ChatRoomType;
    title: string | null;
    status: string;
    meetingId: string | null;
  };
  members: ClientRoomMember[];
  messages: ClientChatMessage[];
}> {
  const { chatAliasId, chatAliasLabel } = await import("@/lib/chat/pseudonym");
  const { room, members, messages } = await getRoomThreadByPolicy(actor, roomId, options);
  const me = toEmail(actor.email);
  return {
    /* room 도 통째로 내보내지 않는다 — createdByEmail·lastSenderEmail 이 들어 있다. */
    room: {
      id: room.id,
      roomType: room.roomType,
      title: room.title,
      status: room.status,
      meetingId: room.meetingId,
    },
    members: members
      /* 합성 멤버(@chat.local — expert-·group- 자리표시)는 사람이 아니다. 서버에서 거른다. */
      .filter((m) => !toEmail(m.userEmail).endsWith("@chat.local"))
      .map((m) => {
        const aliasId = chatAliasId(m.userEmail);
        return {
          id: aliasId,
          label: chatAliasLabel(aliasId),
          role: m.role,
          isSelf: toEmail(m.userEmail) === me,
        };
      }),
    messages: messages.map((msg) => {
      const aliasId = chatAliasId(msg.senderEmail);
      return {
        id: msg.id,
        senderId: aliasId,
        senderLabel: chatAliasLabel(aliasId),
        isMine: toEmail(msg.senderEmail) === me,
        body: msg.body,
        messageType: msg.messageType,
        createdAt: msg.createdAt,
        attachments: msg.attachments.map((a) => ({
          id: a.id,
          fileUrl: a.fileUrl,
          mime: a.mime,
          sizeBytes: a.sizeBytes,
        })),
      };
    }),
  };
}

/**
 * (roomId, 가명 ID) 로 차단/해제 — 지목 가능 범위가 자기 방 멤버로 제한된다.
 * listChatRoomMembers 는 actor 가 그 방 멤버가 아니면 빈 배열을 주므로,
 * 방 밖 사람이 이 경로로 남을 차단하는 일은 성립하지 않는다.
 */
async function resolveRoomAliasOrThrow(
  actor: SessionActor,
  roomId: string,
  blockedId: string,
): Promise<string> {
  const { resolveChatAlias } = await import("@/lib/chat/pseudonym");
  const members = await listChatRoomMembers(roomId, actor.email);
  if (members.length === 0) throw new Error("CHAT_ROOM_FORBIDDEN");
  const email = resolveChatAlias(
    blockedId,
    members.map((m) => m.userEmail).filter((e) => !toEmail(e).endsWith("@chat.local")),
  );
  if (!email) throw new Error("CHAT_BLOCK_TARGET_NOT_FOUND");
  return email;
}

export async function blockUserByAliasPolicy(
  actor: SessionActor,
  input: { roomId: string; blockedId: string; reason?: string | null },
) {
  const email = await resolveRoomAliasOrThrow(actor, input.roomId, input.blockedId);
  return blockUserByPolicy(actor, email, input.reason ?? null);
}

export async function unblockUserByAliasPolicy(
  actor: SessionActor,
  input: { roomId: string; blockedId: string },
) {
  const email = await resolveRoomAliasOrThrow(actor, input.roomId, input.blockedId);
  return unblockUserByPolicy(actor, email);
}

/** 내 차단 목록 — 가명 ID 만 (상대 이메일을 응답에 싣지 않는다). */
export async function listBlockIdsByPolicy(
  actor: SessionActor,
): Promise<Array<{ blockedId: string; createdAt: string }>> {
  const { chatAliasId } = await import("@/lib/chat/pseudonym");
  const blocks = await listBlocksForUser(actor.email);
  return blocks.map((b) => ({
    blockedId: chatAliasId(b.blockedEmail),
    createdAt: b.createdAt,
  }));
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
  // /town/groups/[id]/chat 의 [id] 는 meetingId 다 — 예전에는 roomId 를 넣어서
  // 알림을 누르면 getMeeting(roomId)=null → "모임을 찾을 수 없어요"로 떨어졌다.
  // room→meeting 매핑(chat_rooms.meeting_id)으로 올바른 URL 을 만들고,
  // 모임이 아닌 방(전문가 상담·1:1)은 각자 열람 지점으로 보낸다.
  const actionUrl =
    room.roomType === "group" && room.meetingId
      ? `/town/groups/${room.meetingId}/chat`
      : room.roomType === "expert"
        ? "/my/consultations"
        : "/notifications";
  for (const email of recipients) {
    // 모임 채팅은 수신자의 알림 설정(pushMeeting=인앱 · emailMeeting=이메일)을 존중한다.
    // 설정 조회에 실패하면 기본값(켜짐)으로 발송 — 알림 유실보다 중복이 낫다.
    let allowInbox = true;
    let allowEmail = true;
    if (room.roomType === "group") {
      try {
        const prefs = await getPrefs(email);
        allowInbox = prefs.pushMeeting;
        allowEmail = prefs.emailMeeting;
      } catch {
        /* 기본 발송 유지 */
      }
    }
    // 인앱 알림은 실시간성, 이메일 outbox는 백오프 전송용
    if (allowInbox) {
      await pushInboxNotification({
        userEmail: email,
        title: "새 채팅 메시지",
        body: preview,
        actionUrl,
      });
    }
    if (allowEmail) {
      await enqueueEmailNotification({
        to: email,
        subject: "[내집나우] 새 채팅 메시지",
        body: preview,
        metadata: { roomId: input.roomId, messageId: message.id, from: sender },
      });
    }
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
