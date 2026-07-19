import { getServiceSupabase } from "@/lib/supabase/service";
import type {
  ChatAttachment,
  ChatBlock,
  ChatMemberRole,
  ChatMessage,
  ChatMessageType,
  ChatReport,
  ChatReportStatus,
  ChatRoomMember,
  ChatSearchHit,
  ChatRoomSummary,
  ChatRoomType,
} from "@/lib/chat/types";

type CreateRoomInput = {
  roomType: ChatRoomType;
  actorEmail: string;
  memberEmails: string[];
  title?: string | null;
  expertId?: string | null;
  meetingId?: string | null;
  metadata?: Record<string, unknown>;
};

type SendMessageInput = {
  roomId: string;
  senderEmail: string;
  body?: string | null;
  messageType?: ChatMessageType;
  attachments?: Array<{
    fileUrl: string;
    filePath?: string | null;
    mime?: string | null;
    sizeBytes?: number;
  }>;
};

type MemoryStore = {
  rooms: ChatRoomSummary[];
  members: ChatRoomMember[];
  messages: ChatMessage[];
  reports: ChatReport[];
  blocks: ChatBlock[];
};

const memory: MemoryStore = {
  rooms: [],
  members: [],
  messages: [],
  reports: [],
  blocks: [],
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function ensureUniqueEmails(emails: string[]): string[] {
  return [...new Set(emails.map(normalizeEmail).filter(Boolean))];
}

async function isRoomMember(roomId: string, userEmail: string): Promise<boolean> {
  const email = normalizeEmail(userEmail);
  const sb = getServiceSupabase();
  if (!sb) {
    return memory.members.some(
      (m) =>
        m.roomId === roomId &&
        normalizeEmail(m.userEmail) === email &&
        m.leftAt == null,
    );
  }
  const { data } = await sb
    .from("chat_room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_email", email)
    .is("left_at", null)
    .maybeSingle();
  return Boolean(data);
}

/** 모임(meeting)에 연결된 그룹 채팅방 id 조회 (없으면 null) */
export async function findGroupRoomIdByMeeting(meetingId: string): Promise<string | null> {
  const sb = getServiceSupabase();
  if (!sb) {
    const room = memory.rooms.find(
      (r) => r.roomType === "group" && r.meetingId === meetingId,
    );
    return room?.id ?? null;
  }
  const { data } = await sb
    .from("chat_rooms")
    .select("id")
    .eq("room_type", "group")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? String(data.id) : null;
}

/** 방 멤버십 보장 — 없으면 추가, 나간 상태면 재참여 */
export async function ensureRoomMembership(
  roomId: string,
  userEmail: string,
): Promise<void> {
  const email = normalizeEmail(userEmail);
  const sb = getServiceSupabase();
  if (!sb) {
    const existing = memory.members.find(
      (m) => m.roomId === roomId && normalizeEmail(m.userEmail) === email,
    );
    if (existing) {
      existing.leftAt = null;
      return;
    }
    memory.members.push({
      id: crypto.randomUUID(),
      roomId,
      userEmail: email,
      role: "member",
      muted: false,
      joinedAt: nowIso(),
      leftAt: null,
      lastReadMessageId: null,
    });
    return;
  }
  const { data: existing } = await sb
    .from("chat_room_members")
    .select("id, left_at")
    .eq("room_id", roomId)
    .eq("user_email", email)
    .maybeSingle();
  if (existing) {
    if (existing.left_at) {
      await sb.from("chat_room_members").update({ left_at: null }).eq("id", existing.id);
    }
    return;
  }
  await sb
    .from("chat_room_members")
    .insert({ room_id: roomId, user_email: email, role: "member" });
}

export async function listChatRoomsForUser(
  userEmail: string,
  keyword?: string,
): Promise<ChatRoomSummary[]> {
  const email = normalizeEmail(userEmail);
  const sb = getServiceSupabase();
  const q = keyword?.trim().toLowerCase() ?? "";
  if (!sb) {
    const roomIds = memory.members
      .filter((m) => normalizeEmail(m.userEmail) === email && m.leftAt == null)
      .map((m) => m.roomId);
    return memory.rooms
      .filter((r) => roomIds.includes(r.id))
      .filter((r) =>
        q ? (r.title ?? "").toLowerCase().includes(q) : true,
      )
      .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
      .map((r) => {
        const member = memory.members.find(
          (m) =>
            m.roomId === r.id &&
            normalizeEmail(m.userEmail) === email &&
            m.leftAt == null,
        );
        const lastReadAt = member?.lastReadMessageId
          ? memory.messages.find((m) => m.id === member.lastReadMessageId)?.createdAt ?? ""
          : "";
        const unreadCount = memory.messages.filter((m) => {
          if (m.roomId !== r.id) return false;
          if (normalizeEmail(m.senderEmail) === email) return false;
          return !lastReadAt || m.createdAt > lastReadAt;
        }).length;
        const lastMemMsg = memory.messages.filter((m) => m.roomId === r.id).slice(-1)[0] ?? null;
        return {
          ...r,
          unreadCount,
          lastMessagePreview: lastMemMsg?.body?.slice(0, 60) ?? null,
          lastSenderEmail: lastMemMsg?.senderEmail ?? null,
        };
      });
  }

  const { data: members } = await sb
    .from("chat_room_members")
    .select("room_id,last_read_message_id")
    .eq("user_email", email)
    .is("left_at", null)
    .limit(300);
  const roomIds = (members ?? []).map((m) => String(m.room_id));
  if (roomIds.length === 0) return [];
  const memberByRoom = new Map<string, string | null>();
  for (const row of members ?? []) {
    memberByRoom.set(
      String(row.room_id),
      (row.last_read_message_id as string | null) ?? null,
    );
  }

  let query = sb
    .from("chat_rooms")
    .select("*")
    .in("id", roomIds)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data: rooms } = await query;
  if (!rooms) return [];

  const counts = new Map<string, number>();
  const { data: roomMembers } = await sb
    .from("chat_room_members")
    .select("room_id")
    .in("room_id", roomIds);
  for (const row of roomMembers ?? []) {
    const id = String(row.room_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const { data: allMessages } = await sb
    .from("chat_messages")
    .select("id,room_id,sender_email,body,created_at")
    .in("room_id", roomIds)
    .order("created_at", { ascending: true })
    .limit(5000);
  const readIds = [...new Set([...memberByRoom.values()].filter(Boolean))] as string[];
  const readTimeById = new Map<string, string>();
  if (readIds.length > 0) {
    const { data: readMessages } = await sb
      .from("chat_messages")
      .select("id,created_at")
      .in("id", readIds);
    for (const row of readMessages ?? []) {
      readTimeById.set(String(row.id), String(row.created_at ?? ""));
    }
  }
  const unreadByRoom = new Map<string, number>();
  const lastMsgByRoom = new Map<string, { body: string | null; senderEmail: string }>();
  for (const row of allMessages ?? []) {
    const roomId = String(row.room_id);
    lastMsgByRoom.set(roomId, {
      body: (row.body as string | null) ?? null,
      senderEmail: String(row.sender_email ?? ""),
    });
    if (normalizeEmail(String(row.sender_email ?? "")) === email) continue;
    const lastReadId = memberByRoom.get(roomId) ?? null;
    const lastReadTime = lastReadId ? readTimeById.get(lastReadId) ?? "" : "";
    const createdAt = String(row.created_at ?? "");
    if (!lastReadTime || createdAt > lastReadTime) {
      unreadByRoom.set(roomId, (unreadByRoom.get(roomId) ?? 0) + 1);
    }
  }
  return rooms.map((r) => {
    const lastMsg = lastMsgByRoom.get(String(r.id)) ?? null;
    return {
      id: String(r.id),
      roomType: r.room_type as ChatRoomType,
      title: (r.title as string | null) ?? null,
      status: (r.status as ChatRoomSummary["status"]) ?? "active",
      createdByEmail: String(r.created_by_email ?? ""),
      expertId: (r.expert_id as string | null) ?? null,
      meetingId: (r.meeting_id as string | null) ?? null,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      lastMessageAt: (r.last_message_at as string | null) ?? null,
      lastMessagePreview: lastMsg?.body?.slice(0, 60) ?? null,
      lastSenderEmail: lastMsg?.senderEmail ?? null,
      createdAt: String(r.created_at ?? ""),
      updatedAt: String(r.updated_at ?? ""),
      memberCount: counts.get(String(r.id)) ?? 0,
      unreadCount: unreadByRoom.get(String(r.id)) ?? 0,
    };
  });
}

export async function searchChatMessagesForUser(
  userEmail: string,
  q: string,
  options?: { roomId?: string; limit?: number },
): Promise<ChatSearchHit[]> {
  const email = normalizeEmail(userEmail);
  const keyword = q.trim();
  if (!keyword) return [];
  const limit = Math.max(1, Math.min(100, options?.limit ?? 40));
  const sb = getServiceSupabase();
  if (!sb) {
    const rooms = await listChatRoomsForUser(email);
    const allowedRoomSet = new Set(
      rooms
        .map((r) => r.id)
        .filter((id) => (options?.roomId ? id === options.roomId : true)),
    );
    return memory.messages
      .filter((m) => allowedRoomSet.has(m.roomId))
      .filter((m) => (m.body ?? "").toLowerCase().includes(keyword.toLowerCase()))
      .slice(-limit)
      .map((m) => ({
        roomId: m.roomId,
        roomTitle: rooms.find((r) => r.id === m.roomId)?.title ?? null,
        messageId: m.id,
        senderEmail: m.senderEmail,
        body: m.body,
        createdAt: m.createdAt,
      }));
  }
  const { data: memberRows } = await sb
    .from("chat_room_members")
    .select("room_id")
    .eq("user_email", email)
    .is("left_at", null)
    .limit(500);
  const roomIds = (memberRows ?? []).map((r) => String(r.room_id));
  if (roomIds.length === 0) return [];

  const query = sb
    .from("chat_messages")
    .select("id,room_id,sender_email,body,created_at")
    .in("room_id", options?.roomId ? [options.roomId] : roomIds)
    .ilike("body", `%${keyword}%`)
    .order("created_at", { ascending: false })
    .limit(limit);
  const { data } = await query;
  if (!data) return [];

  const hitRoomIds = [...new Set(data.map((r) => String(r.room_id)))];
  const { data: rooms } = await sb
    .from("chat_rooms")
    .select("id,title")
    .in("id", hitRoomIds);
  const roomTitleById = new Map<string, string | null>();
  for (const room of rooms ?? []) {
    roomTitleById.set(String(room.id), (room.title as string | null) ?? null);
  }
  return data.map((row) => ({
    roomId: String(row.room_id),
    roomTitle: roomTitleById.get(String(row.room_id)) ?? null,
    messageId: String(row.id),
    senderEmail: String(row.sender_email ?? ""),
    body: (row.body as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function getChatRoomByIdForUser(
  roomId: string,
  userEmail: string,
): Promise<ChatRoomSummary | null> {
  const email = normalizeEmail(userEmail);
  const member = await isRoomMember(roomId, email);
  if (!member) return null;
  const rooms = await listChatRoomsForUser(email);
  return rooms.find((r) => r.id === roomId) ?? null;
}

export async function listChatRoomMembers(
  roomId: string,
  userEmail: string,
): Promise<ChatRoomMember[]> {
  const email = normalizeEmail(userEmail);
  const member = await isRoomMember(roomId, email);
  if (!member) return [];
  const sb = getServiceSupabase();
  if (!sb) {
    return memory.members.filter((m) => m.roomId === roomId && m.leftAt == null);
  }
  const { data } = await sb
    .from("chat_room_members")
    .select("*")
    .eq("room_id", roomId)
    .is("left_at", null)
    .order("joined_at", { ascending: true });
  return (data ?? []).map((m) => ({
    id: String(m.id),
    roomId: String(m.room_id),
    userEmail: String(m.user_email),
    role: (m.role as ChatMemberRole) ?? "member",
    muted: Boolean(m.muted),
    joinedAt: String(m.joined_at ?? ""),
    leftAt: (m.left_at as string | null) ?? null,
    lastReadMessageId: (m.last_read_message_id as string | null) ?? null,
  }));
}

export async function createChatRoom(input: CreateRoomInput): Promise<ChatRoomSummary> {
  const actor = normalizeEmail(input.actorEmail);
  const memberEmails = ensureUniqueEmails([...input.memberEmails, actor]);
  if (input.roomType === "direct" && memberEmails.length !== 2) {
    throw new Error("DIRECT_ROOM_REQUIRES_TWO_MEMBERS");
  }

  const sb = getServiceSupabase();
  if (!sb) {
    const id = crypto.randomUUID();
    const now = nowIso();
    const room: ChatRoomSummary = {
      id,
      roomType: input.roomType,
      title: input.title ?? null,
      status: "active",
      createdByEmail: actor,
      expertId: input.expertId ?? null,
      meetingId: input.meetingId ?? null,
      metadata: input.metadata ?? {},
      lastMessageAt: null,
      lastMessagePreview: null,
      lastSenderEmail: null,
      createdAt: now,
      updatedAt: now,
      memberCount: memberEmails.length,
      unreadCount: 0,
    };
    memory.rooms.unshift(room);
    memberEmails.forEach((email, idx) => {
      memory.members.push({
        id: crypto.randomUUID(),
        roomId: id,
        userEmail: email,
        role: idx === 0 ? "owner" : "member",
        muted: false,
        joinedAt: now,
        leftAt: null,
        lastReadMessageId: null,
      });
    });
    return room;
  }

  const { data: room, error } = await sb
    .from("chat_rooms")
    .insert({
      room_type: input.roomType,
      title: input.title ?? null,
      created_by_email: actor,
      expert_id: input.expertId ?? null,
      meeting_id: input.meetingId ?? null,
      metadata: input.metadata ?? {},
      status: "active",
    })
    .select("*")
    .single();
  if (error || !room) {
    throw new Error(error?.message ?? "CHAT_ROOM_CREATE_FAILED");
  }

  const { error: memberError } = await sb.from("chat_room_members").insert(
    memberEmails.map((email, idx) => ({
      room_id: room.id,
      user_email: email,
      role: idx === 0 ? "owner" : "member",
    })),
  );
  if (memberError) throw new Error(memberError.message);

  return {
    id: String(room.id),
    roomType: room.room_type as ChatRoomType,
    title: (room.title as string | null) ?? null,
    status: (room.status as ChatRoomSummary["status"]) ?? "active",
    createdByEmail: String(room.created_by_email ?? ""),
    expertId: (room.expert_id as string | null) ?? null,
    meetingId: (room.meeting_id as string | null) ?? null,
    metadata: (room.metadata as Record<string, unknown>) ?? {},
    lastMessageAt: (room.last_message_at as string | null) ?? null,
    lastMessagePreview: null,
    lastSenderEmail: null,
    createdAt: String(room.created_at ?? ""),
    updatedAt: String(room.updated_at ?? ""),
    memberCount: memberEmails.length,
    unreadCount: 0,
  };
}

export async function listChatMessagesForRoom(
  roomId: string,
  userEmail: string,
  options?: { limit?: number; before?: string; q?: string },
): Promise<ChatMessage[]> {
  const email = normalizeEmail(userEmail);
  const member = await isRoomMember(roomId, email);
  if (!member) return [];
  const limit = Math.max(1, Math.min(100, options?.limit ?? 50));
  const sb = getServiceSupabase();

  if (!sb) {
    const q = options?.q?.trim().toLowerCase();
    return memory.messages
      .filter((m) => m.roomId === roomId)
      .filter((m) => (options?.before ? m.createdAt < options.before : true))
      .filter((m) => (q ? (m.body ?? "").toLowerCase().includes(q) : true))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-limit);
  }

  let query = sb
    .from("chat_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (options?.before) query = query.lt("created_at", options.before);
  if (options?.q?.trim()) query = query.ilike("body", `%${options.q.trim()}%`);

  const { data } = await query;
  const messages = (data ?? []).map((m) => ({
    id: String(m.id),
    roomId: String(m.room_id),
    senderEmail: String(m.sender_email ?? ""),
    body: (m.body as string | null) ?? null,
    messageType: (m.message_type as ChatMessageType) ?? "text",
    deletedAt: (m.deleted_at as string | null) ?? null,
    createdAt: String(m.created_at ?? ""),
    attachments: [] as ChatAttachment[],
  }));

  const messageIds = messages.map((m) => m.id);
  if (messageIds.length > 0) {
    const { data: attachments } = await sb
      .from("chat_attachments")
      .select("*")
      .in("message_id", messageIds)
      .order("created_at", { ascending: true });
    const grouped = new Map<string, ChatAttachment[]>();
    for (const a of attachments ?? []) {
      const item: ChatAttachment = {
        id: String(a.id),
        messageId: String(a.message_id),
        fileUrl: String(a.file_url ?? ""),
        filePath: (a.file_path as string | null) ?? null,
        mime: (a.mime as string | null) ?? null,
        sizeBytes: Number(a.size_bytes ?? 0),
        createdAt: String(a.created_at ?? ""),
      };
      const list = grouped.get(item.messageId) ?? [];
      list.push(item);
      grouped.set(item.messageId, list);
    }
    messages.forEach((m) => {
      m.attachments = grouped.get(m.id) ?? [];
    });
  }
  return messages.reverse();
}

export async function sendChatMessage(input: SendMessageInput): Promise<ChatMessage> {
  const sender = normalizeEmail(input.senderEmail);
  const member = await isRoomMember(input.roomId, sender);
  if (!member) throw new Error("CHAT_ROOM_FORBIDDEN");
  const blocks = await listBlocksForUser(sender);
  const roomMembers = await listChatRoomMembers(input.roomId, sender);
  const blockedSet = new Set(blocks.map((b) => normalizeEmail(b.blockedEmail)));
  const hasBlockedPeer = roomMembers.some((m) => blockedSet.has(normalizeEmail(m.userEmail)));
  if (hasBlockedPeer) throw new Error("CHAT_BLOCKED_USER");

  const messageType = input.messageType ?? "text";
  const body = input.body?.trim() ?? null;
  if (!body && (input.attachments?.length ?? 0) === 0) {
    throw new Error("CHAT_MESSAGE_EMPTY");
  }

  const sb = getServiceSupabase();
  if (!sb) {
    const id = crypto.randomUUID();
    const msg: ChatMessage = {
      id,
      roomId: input.roomId,
      senderEmail: sender,
      body,
      messageType,
      deletedAt: null,
      createdAt: nowIso(),
      attachments: (input.attachments ?? []).map((a) => ({
        id: crypto.randomUUID(),
        messageId: id,
        fileUrl: a.fileUrl,
        filePath: a.filePath ?? null,
        mime: a.mime ?? null,
        sizeBytes: a.sizeBytes ?? 0,
        createdAt: nowIso(),
      })),
    };
    memory.messages.push(msg);
    const room = memory.rooms.find((r) => r.id === input.roomId);
    if (room) {
      room.lastMessageAt = msg.createdAt;
      room.updatedAt = msg.createdAt;
    }
    return msg;
  }

  const { data: created, error } = await sb
    .from("chat_messages")
    .insert({
      room_id: input.roomId,
      sender_email: sender,
      body,
      message_type: messageType,
    })
    .select("*")
    .single();
  if (error || !created) throw new Error(error?.message ?? "CHAT_MESSAGE_CREATE_FAILED");

  let attachments: ChatAttachment[] = [];
  if (input.attachments?.length) {
    const payload = input.attachments.map((a) => ({
      message_id: created.id,
      file_url: a.fileUrl,
      file_path: a.filePath ?? null,
      mime: a.mime ?? null,
      size_bytes: a.sizeBytes ?? 0,
    }));
    const { data: atts } = await sb.from("chat_attachments").insert(payload).select("*");
    attachments = (atts ?? []).map((a) => ({
      id: String(a.id),
      messageId: String(a.message_id),
      fileUrl: String(a.file_url ?? ""),
      filePath: (a.file_path as string | null) ?? null,
      mime: (a.mime as string | null) ?? null,
      sizeBytes: Number(a.size_bytes ?? 0),
      createdAt: String(a.created_at ?? ""),
    }));
  }

  return {
    id: String(created.id),
    roomId: String(created.room_id),
    senderEmail: String(created.sender_email ?? ""),
    body: (created.body as string | null) ?? null,
    messageType: (created.message_type as ChatMessageType) ?? "text",
    deletedAt: (created.deleted_at as string | null) ?? null,
    createdAt: String(created.created_at ?? ""),
    attachments,
  };
}

export async function markChatRoomRead(
  roomId: string,
  userEmail: string,
  lastReadMessageId: string | null,
): Promise<boolean> {
  const email = normalizeEmail(userEmail);
  const sb = getServiceSupabase();
  if (!sb) {
    const row = memory.members.find(
      (m) => m.roomId === roomId && normalizeEmail(m.userEmail) === email,
    );
    if (!row) return false;
    row.lastReadMessageId = lastReadMessageId;
    return true;
  }
  const { error } = await sb
    .from("chat_room_members")
    .update({ last_read_message_id: lastReadMessageId })
    .eq("room_id", roomId)
    .eq("user_email", email);
  return !error;
}

export async function reportChatMessage(input: {
  messageId: string;
  reporterEmail: string;
  reason: string;
}): Promise<ChatReport> {
  const reporter = normalizeEmail(input.reporterEmail);
  const sb = getServiceSupabase();
  const reason = input.reason.trim();
  if (!reason) throw new Error("CHAT_REPORT_REASON_REQUIRED");
  if (!sb) {
    const msg = memory.messages.find((m) => m.id === input.messageId);
    if (!msg) throw new Error("CHAT_MESSAGE_NOT_FOUND");
    const report: ChatReport = {
      id: crypto.randomUUID(),
      roomId: msg.roomId,
      messageId: msg.id,
      reporterEmail: reporter,
      targetEmail: msg.senderEmail,
      reason,
      status: "open",
      handledByEmail: null,
      handledAt: null,
      createdAt: nowIso(),
    };
    memory.reports.unshift(report);
    return report;
  }
  const { data: msg } = await sb
    .from("chat_messages")
    .select("id, room_id, sender_email")
    .eq("id", input.messageId)
    .maybeSingle();
  if (!msg) throw new Error("CHAT_MESSAGE_NOT_FOUND");
  const ok = await isRoomMember(String(msg.room_id), reporter);
  if (!ok) throw new Error("CHAT_ROOM_FORBIDDEN");

  const { data: report, error } = await sb
    .from("chat_reports")
    .insert({
      room_id: msg.room_id,
      message_id: msg.id,
      reporter_email: reporter,
      target_email: msg.sender_email,
      reason,
      status: "open",
    })
    .select("*")
    .single();
  if (error || !report) throw new Error(error?.message ?? "CHAT_REPORT_CREATE_FAILED");
  return {
    id: String(report.id),
    roomId: (report.room_id as string | null) ?? null,
    messageId: (report.message_id as string | null) ?? null,
    reporterEmail: String(report.reporter_email ?? ""),
    targetEmail: (report.target_email as string | null) ?? null,
    reason: String(report.reason ?? ""),
    status: (report.status as ChatReportStatus) ?? "open",
    handledByEmail: (report.handled_by_email as string | null) ?? null,
    handledAt: (report.handled_at as string | null) ?? null,
    createdAt: String(report.created_at ?? ""),
  };
}

export async function softDeleteChatMessage(
  messageId: string,
  actorEmail: string,
  isAdmin: boolean,
): Promise<boolean> {
  const email = normalizeEmail(actorEmail);
  const sb = getServiceSupabase();
  if (!sb) {
    const msg = memory.messages.find((m) => m.id === messageId);
    if (!msg) return false;
    if (!isAdmin && normalizeEmail(msg.senderEmail) !== email) return false;
    msg.deletedAt = nowIso();
    msg.body = "삭제된 메시지입니다.";
    return true;
  }

  const { data: msg } = await sb
    .from("chat_messages")
    .select("id, sender_email")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return false;
  if (!isAdmin && normalizeEmail(String(msg.sender_email)) !== email) return false;

  const { error } = await sb
    .from("chat_messages")
    .update({
      deleted_at: nowIso(),
      body: "삭제된 메시지입니다.",
      message_type: "system",
    })
    .eq("id", messageId);
  return !error;
}

export async function upsertChatPresence(input: {
  userEmail: string;
  roomId?: string | null;
  isOnline: boolean;
}): Promise<void> {
  const sb = getServiceSupabase();
  const email = normalizeEmail(input.userEmail);
  if (!sb) return;
  await sb.from("chat_presence").upsert({
    user_email: email,
    room_id: input.roomId ?? null,
    is_online: input.isOnline,
    last_seen_at: nowIso(),
  });
}

export async function createBlock(input: {
  blockerEmail: string;
  blockedEmail: string;
  reason?: string | null;
}): Promise<ChatBlock> {
  const blocker = normalizeEmail(input.blockerEmail);
  const blocked = normalizeEmail(input.blockedEmail);
  if (blocker === blocked) throw new Error("CHAT_BLOCK_SELF_NOT_ALLOWED");
  const sb = getServiceSupabase();
  if (!sb) {
    const existing = memory.blocks.find(
      (b) =>
        normalizeEmail(b.blockerEmail) === blocker &&
        normalizeEmail(b.blockedEmail) === blocked,
    );
    if (existing) return existing;
    const row: ChatBlock = {
      id: crypto.randomUUID(),
      blockerEmail: blocker,
      blockedEmail: blocked,
      reason: input.reason ?? null,
      createdAt: nowIso(),
    };
    memory.blocks.unshift(row);
    return row;
  }
  const { data, error } = await sb
    .from("chat_blocks")
    .upsert({
      blocker_email: blocker,
      blocked_email: blocked,
      reason: input.reason ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "CHAT_BLOCK_CREATE_FAILED");
  return {
    id: String(data.id),
    blockerEmail: String(data.blocker_email ?? ""),
    blockedEmail: String(data.blocked_email ?? ""),
    reason: (data.reason as string | null) ?? null,
    createdAt: String(data.created_at ?? ""),
  };
}

export async function listBlocksForUser(userEmail: string): Promise<ChatBlock[]> {
  const email = normalizeEmail(userEmail);
  const sb = getServiceSupabase();
  if (!sb) {
    return memory.blocks.filter((b) => normalizeEmail(b.blockerEmail) === email);
  }
  const { data } = await sb
    .from("chat_blocks")
    .select("*")
    .eq("blocker_email", email)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => ({
    id: String(row.id),
    blockerEmail: String(row.blocker_email ?? ""),
    blockedEmail: String(row.blocked_email ?? ""),
    reason: (row.reason as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  }));
}

export async function removeBlock(blockerEmail: string, blockedEmail: string): Promise<boolean> {
  const blocker = normalizeEmail(blockerEmail);
  const blocked = normalizeEmail(blockedEmail);
  const sb = getServiceSupabase();
  if (!sb) {
    const idx = memory.blocks.findIndex(
      (b) =>
        normalizeEmail(b.blockerEmail) === blocker &&
        normalizeEmail(b.blockedEmail) === blocked,
    );
    if (idx >= 0) memory.blocks.splice(idx, 1);
    return idx >= 0;
  }
  const { error } = await sb
    .from("chat_blocks")
    .delete()
    .eq("blocker_email", blocker)
    .eq("blocked_email", blocked);
  return !error;
}

export async function listChatReportsForAdmin(
  status: ChatReportStatus | "all" = "open",
): Promise<ChatReport[]> {
  const sb = getServiceSupabase();
  if (!sb) {
    const rows = status === "all" ? memory.reports : memory.reports.filter((r) => r.status === status);
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  let query = sb
    .from("chat_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "all") query = query.eq("status", status);
  const { data } = await query;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    roomId: (row.room_id as string | null) ?? null,
    messageId: (row.message_id as string | null) ?? null,
    reporterEmail: String(row.reporter_email ?? ""),
    targetEmail: (row.target_email as string | null) ?? null,
    reason: String(row.reason ?? ""),
    status: (row.status as ChatReportStatus) ?? "open",
    handledByEmail: (row.handled_by_email as string | null) ?? null,
    handledAt: (row.handled_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  }));
}

/**
 * 해당 사용자의 미읽음 채팅방 수를 반환합니다.
 * Supabase 미연결 환경에서는 in-memory 기준으로 계산합니다.
 */
export async function countUnreadChatRooms(userEmail: string): Promise<number> {
  const email = normalizeEmail(userEmail);
  const sb = getServiceSupabase();
  if (!sb) {
    const myRooms = memory.members
      .filter((m) => normalizeEmail(m.userEmail) === email && m.leftAt == null)
      .map((m) => m.roomId);
    return myRooms.length;
  }
  const { data } = await sb
    .from("chat_room_members")
    .select("room_id, last_read_message_id, chat_rooms!inner(last_message_at)")
    .eq("user_email", email)
    .is("left_at", null);
  if (!data) return 0;
  let count = 0;
  for (const row of data) {
    const rawRow = row as unknown as {
      room_id: string;
      last_read_message_id: string | null;
      chat_rooms: { last_message_at: string | null } | { last_message_at: string | null }[];
    };
    const chatRooms = rawRow.chat_rooms;
    const roomInfo = Array.isArray(chatRooms) ? chatRooms[0] : chatRooms;
    const roomLastMsg = roomInfo?.last_message_at;
    if (!roomLastMsg) continue;
    const lastRead = rawRow.last_read_message_id;
    if (!lastRead) {
      count += 1;
      continue;
    }
    const { data: latestMsgs } = await sb
      .from("chat_messages")
      .select("id, created_at")
      .eq("room_id", rawRow.room_id)
      .order("created_at", { ascending: false })
      .limit(1);
    const latest = latestMsgs?.[0];
    if (latest && latest.id !== lastRead) count += 1;
  }
  return count;
}

export async function updateChatReportStatus(input: {
  reportId: string;
  status: ChatReportStatus;
  handledByEmail: string;
}): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) {
    const target = memory.reports.find((r) => r.id === input.reportId);
    if (!target) return false;
    target.status = input.status;
    target.handledByEmail = normalizeEmail(input.handledByEmail);
    target.handledAt = nowIso();
    return true;
  }
  const { error } = await sb
    .from("chat_reports")
    .update({
      status: input.status,
      handled_by_email: normalizeEmail(input.handledByEmail),
      handled_at: nowIso(),
    })
    .eq("id", input.reportId);
  return !error;
}
