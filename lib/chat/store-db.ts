/**
 * 채팅 저장소.
 *
 * 조회·갱신이 **실패하면 던진다**(lib/chat/errors 의 ChatUnavailableError).
 * 빈 배열·false·null 로 답하면 화면이 "없다"·"권한 없다"로 그리는데, 그건
 * 일어나지 않은 사실이다. 부르는 쪽(app/api/chat/**)은 이 예외를 503 +
 * Retry-After 로 옮긴다 — 404·403 으로 옮기면 안 된다.
 *
 * `!sb` 분기는 예외가 아니다. 저장소가 아예 없는 개발 환경에서 in-memory 로
 * 동작하라고 의도적으로 둔 폴백이라 그대로 둔다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { chatDbError } from "@/lib/chat/errors";
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
  const { data, error } = await sb
    .from("chat_room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_email", email)
    .is("left_at", null)
    .maybeSingle();
  /* 못 읽은 것을 false 로 답하면 "당신은 이 방 멤버가 아니다"가 된다 — 자기
     대화방을 열어 둔 사용자에게 403 과 빈 목록이 동시에 뜬다. */
  if (error) throw chatDbError("chat_room_members 조회 실패", error);
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
  const { data, error } = await sb
    .from("chat_rooms")
    .select("id")
    .eq("room_type", "group")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  /* null 을 돌려주면 부르는 쪽(getOrCreateGroupRoomByPolicy)이 "방이 아직 없다"로
     읽고 같은 모임에 채팅방을 하나 더 만든다. 게다가 joinMeeting 이 다시 불려
     current_members 까지 부푼다 — 되돌리기 어려운 쓰기다. */
  if (error) throw chatDbError("chat_rooms 조회 실패", error);
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
  const { data: existing, error } = await sb
    .from("chat_room_members")
    .select("id, left_at")
    .eq("room_id", roomId)
    .eq("user_email", email)
    .maybeSingle();
  /* 못 읽은 것을 "멤버 행이 없다"로 읽으면 아래에서 같은 사람을 한 번 더
     insert 한다 — 멤버 수가 중복 집계되고 목록에 같은 이름이 둘 뜬다. */
  if (error) throw chatDbError("chat_room_members 조회 실패", error);
  if (existing) {
    if (existing.left_at) {
      const { error: reErr } = await sb
        .from("chat_room_members")
        .update({ left_at: null })
        .eq("id", existing.id);
      /* 재참여가 안 됐는데 조용히 끝내면, 화면은 입장했다고 그리고 실제로는
         나간 상태라 메시지가 하나도 안 보인다. */
      if (reErr) throw chatDbError("chat_room_members 재참여 실패", reErr);
    }
    return;
  }
  const { error: insErr } = await sb
    .from("chat_room_members")
    .insert({ room_id: roomId, user_email: email, role: "member" });
  if (insErr) throw chatDbError("chat_room_members 추가 실패", insErr);
}

/**
 * 나간(left_at) 이력까지 포함해 멤버십 레코드 존재 여부 확인.
 * 그룹 채팅 입장 시 current_members 중복 증가를 막는 멱등 판정용 —
 * 한 번이라도 입장했던 사용자는 이미 정원에 집계돼 있다.
 */
export async function hasRoomMembershipRecord(
  roomId: string,
  userEmail: string,
): Promise<boolean> {
  const email = normalizeEmail(userEmail);
  const sb = getServiceSupabase();
  if (!sb) {
    return memory.members.some(
      (m) => m.roomId === roomId && normalizeEmail(m.userEmail) === email,
    );
  }
  const { data, error } = await sb
    .from("chat_room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_email", email)
    .maybeSingle();
  /* 이 값은 정원 집계의 멱등 판정에 쓰인다. false 로 답하면 이미 정원에
     들어가 있는 사람을 "처음 온 사람"으로 보고 current_members 를 한 번 더
     올리거나, 정원이 찼다며 자기 모임 채팅에서 막아 버린다. */
  if (error) throw chatDbError("chat_room_members 조회 실패", error);
  return Boolean(data);
}

/** 방 나가기 — left_at 기록(소프트). 멤버가 아니면 false. */
export async function leaveChatRoom(roomId: string, userEmail: string): Promise<boolean> {
  const email = normalizeEmail(userEmail);
  const sb = getServiceSupabase();
  if (!sb) {
    const member = memory.members.find(
      (m) =>
        m.roomId === roomId &&
        normalizeEmail(m.userEmail) === email &&
        m.leftAt == null,
    );
    if (!member) return false;
    member.leftAt = nowIso();
    return true;
  }
  const { data, error } = await sb
    .from("chat_room_members")
    .update({ left_at: nowIso() })
    .eq("room_id", roomId)
    .eq("user_email", email)
    .is("left_at", null)
    .select("id");
  /* false 는 부르는 쪽에서 403 "채팅방 접근 권한이 없습니다"가 된다 — 방금까지
     대화하던 방에서 나가려던 사용자에게 가장 이상한 답이다. */
  if (error) throw chatDbError("chat_room_members 나가기 실패", error);
  return (data ?? []).length > 0;
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

  /* 아래 다섯 조회 중 하나라도 실패하면 목록 전체를 던진다. 일부만 읽고 그리면
     "대화방이 없어요"(멤버 조회 실패)나 안 읽은 수가 0 인 방 목록이 나오는데,
     둘 다 사용자가 사실로 믿고 넘어가는 화면이다. */
  const { data: members, error: memberError } = await sb
    .from("chat_room_members")
    .select("room_id,last_read_message_id")
    .eq("user_email", email)
    .is("left_at", null)
    .limit(300);
  if (memberError) throw chatDbError("chat_room_members 조회 실패", memberError);
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
  const { data: rooms, error: roomError } = await query;
  if (roomError) throw chatDbError("chat_rooms 조회 실패", roomError);
  if (!rooms) return [];

  const counts = new Map<string, number>();
  const { data: roomMembers, error: countError } = await sb
    .from("chat_room_members")
    .select("room_id")
    .in("room_id", roomIds);
  if (countError) throw chatDbError("chat_room_members 집계 실패", countError);
  for (const row of roomMembers ?? []) {
    const id = String(row.room_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const { data: allMessages, error: messageError } = await sb
    .from("chat_messages")
    .select("id,room_id,sender_email,body,created_at")
    .in("room_id", roomIds)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (messageError) throw chatDbError("chat_messages 조회 실패", messageError);
  const readIds = [...new Set([...memberByRoom.values()].filter(Boolean))] as string[];
  const readTimeById = new Map<string, string>();
  if (readIds.length > 0) {
    const { data: readMessages, error: readError } = await sb
      .from("chat_messages")
      .select("id,created_at")
      .in("id", readIds);
    /* 읽은 시각을 못 읽으면 안 읽은 메시지가 전부 "안 읽음"으로 부풀거나
       반대로 0 이 된다. 배지 숫자는 사용자가 그대로 믿는 값이다. */
    if (readError) throw chatDbError("chat_messages 읽음 시각 조회 실패", readError);
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
  /* 검색은 "없다"가 정상 결과라서 실패를 감추기 가장 쉬운 자리다. 못 읽었는데
     빈 결과를 보여주면 사용자는 그 대화가 정말 없다고 믿고 검색을 그만둔다. */
  const { data: memberRows, error: memberError } = await sb
    .from("chat_room_members")
    .select("room_id")
    .eq("user_email", email)
    .is("left_at", null)
    .limit(500);
  if (memberError) throw chatDbError("chat_room_members 조회 실패", memberError);
  const roomIds = (memberRows ?? []).map((r) => String(r.room_id));
  if (roomIds.length === 0) return [];

  const query = sb
    .from("chat_messages")
    .select("id,room_id,sender_email,body,created_at")
    .in("room_id", options?.roomId ? [options.roomId] : roomIds)
    .ilike("body", `%${keyword}%`)
    .order("created_at", { ascending: false })
    .limit(limit);
  const { data, error } = await query;
  if (error) throw chatDbError("chat_messages 검색 실패", error);
  if (!data) return [];

  const hitRoomIds = [...new Set(data.map((r) => String(r.room_id)))];
  const { data: rooms, error: roomError } = await sb
    .from("chat_rooms")
    .select("id,title")
    .in("id", hitRoomIds);
  if (roomError) throw chatDbError("chat_rooms 조회 실패", roomError);
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
  const { data, error } = await sb
    .from("chat_room_members")
    .select("*")
    .eq("room_id", roomId)
    .is("left_at", null)
    .order("joined_at", { ascending: true });
  /* 이 목록은 sendChatMessage 의 차단 검사에도 쓰인다. 빈 배열로 답하면
     "이 방에 차단한 상대가 없다"가 되어 차단이 조용히 풀린다. */
  if (error) throw chatDbError("chat_room_members 조회 실패", error);
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

  const { data, error } = await query;
  /* 빈 목록은 "아직 아무 말도 없는 방"으로 보인다. 대화가 사라진 것처럼 보이는
     화면은 사용자가 같은 말을 다시 쓰게 만든다. */
  if (error) throw chatDbError("chat_messages 조회 실패", error);
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
    const { data: attachments, error: attachError } = await sb
      .from("chat_attachments")
      .select("*")
      .in("message_id", messageIds)
      .order("created_at", { ascending: true });
    /* 첨부만 빠진 메시지는 "글만 보낸 메시지"로 보인다 — 보낸 사람은 사진을
       보냈다고 알고 있고, 받는 사람은 없다고 안다. */
    if (attachError) throw chatDbError("chat_attachments 조회 실패", attachError);
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
    const { data: atts, error: attachError } = await sb
      .from("chat_attachments")
      .insert(payload)
      .select("*");
    /* 메시지는 이미 저장됐지만 첨부가 안 붙었다. 조용히 넘기면 사용자는 사진을
       보냈다고 믿고 대화를 이어 간다. */
    if (attachError) throw chatDbError("chat_attachments 저장 실패", attachError);
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
  const { data: msg, error: msgError } = await sb
    .from("chat_messages")
    .select("id, room_id, sender_email")
    .eq("id", input.messageId)
    .maybeSingle();
  /* 404 "메시지를 찾을 수 없습니다"는 신고하려는 사람에게 "그런 말은 없었다"로
     읽힌다 — 신고를 포기하게 만드는 답이다. */
  if (msgError) throw chatDbError("chat_messages 조회 실패", msgError);
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

  const { data: msg, error: msgError } = await sb
    .from("chat_messages")
    .select("id, sender_email")
    .eq("id", messageId)
    .maybeSingle();
  /* false 는 "삭제 권한이 없습니다"로 표시된다. 자기 메시지를 지우려는 사람에게
     권한 문제라고 답하면, 실패한 삭제를 성공으로 오해하거나 포기한다. */
  if (msgError) throw chatDbError("chat_messages 조회 실패", msgError);
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
  const { data, error } = await sb
    .from("chat_blocks")
    .select("*")
    .eq("blocker_email", email)
    .order("created_at", { ascending: false });
  /* 이 목록이 비면 sendChatMessage 의 차단 검사가 통과한다 — 차단이 조용히
     풀린 채 메시지가 오간다. 차단은 실패했을 때 열어 두면 안 되는 기능이다. */
  if (error) throw chatDbError("chat_blocks 조회 실패", error);
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
  const { data, error } = await query;
  /* 운영자 화면에서 "미처리 신고 0건"은 볼 일이 없다는 뜻이다. 못 읽은 것을
     그렇게 그리면 아무도 그 신고를 다시 열어 보지 않는다. */
  if (error) throw chatDbError("chat_reports 조회 실패", error);
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
  const { data, error } = await sb
    .from("chat_room_members")
    .select("room_id, last_read_message_id, chat_rooms!inner(last_message_at)")
    .eq("user_email", email)
    .is("left_at", null);
  /* 0 은 화면에서 배지가 사라지는 값이다 — 안 읽은 메시지가 있는데도 없는 것처럼
     보이면 사용자는 그 대화를 영영 안 연다. */
  if (error) throw chatDbError("chat_room_members 조회 실패", error);
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
    const { data: latestMsgs, error: latestError } = await sb
      .from("chat_messages")
      .select("id, created_at")
      .eq("room_id", rawRow.room_id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (latestError) throw chatDbError("chat_messages 조회 실패", latestError);
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

/**
 * 모임별 최근 24시간 메시지 수 (고도화 29 — 모임 카드 활성도 배지).
 *
 * 반환: meetingId → 24h 메시지 수. 방이 없거나 메시지가 없는 모임은 키 자체가
 * 없다 — 호출부는 0/부재를 "배지 미표시"로 같게 다루면 된다(실측만 표기).
 * 조회 실패는 던진다 — 호출부가 배지 전체를 접는다(0으로 위장하지 않는다).
 */
export async function countRecentGroupMessages(
  meetingIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (meetingIds.length === 0) return out;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const sb = getServiceSupabase();
  if (!sb) {
    for (const room of memory.rooms) {
      if (room.roomType !== "group" || !room.meetingId) continue;
      if (!meetingIds.includes(room.meetingId)) continue;
      const n = memory.messages.filter(
        (m) => m.roomId === room.id && m.createdAt >= since,
      ).length;
      if (n > 0) out.set(room.meetingId, (out.get(room.meetingId) ?? 0) + n);
    }
    return out;
  }

  const { data: rooms, error: roomError } = await sb
    .from("chat_rooms")
    .select("id, meeting_id")
    .eq("room_type", "group")
    .in("meeting_id", meetingIds);
  if (roomError) throw chatDbError("chat_rooms 조회 실패 (활성도)", roomError);
  const meetingByRoom = new Map<string, string>();
  for (const r of rooms ?? []) {
    if (r.meeting_id) meetingByRoom.set(String(r.id), String(r.meeting_id));
  }
  if (meetingByRoom.size === 0) return out;

  /* PostgREST 는 GROUP BY 가 없으므로 24h 분량을 받아 세는데, 상한(2000)을
     둔다. 상한에 걸리면 그 이상은 "매우 활발"이라는 뜻이라 배지 목적(활성도
     표시)에는 이미 충분하다 — 정확한 총계가 필요한 화면이 아니다. */
  const { data: msgs, error: msgError } = await sb
    .from("chat_messages")
    .select("room_id")
    .in("room_id", [...meetingByRoom.keys()])
    .gte("created_at", since)
    .limit(2000);
  if (msgError) throw chatDbError("chat_messages 집계 실패 (활성도)", msgError);
  for (const m of msgs ?? []) {
    const meetingId = meetingByRoom.get(String(m.room_id));
    if (meetingId) out.set(meetingId, (out.get(meetingId) ?? 0) + 1);
  }
  return out;
}
