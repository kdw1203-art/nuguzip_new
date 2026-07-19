export type ChatRoomType = "direct" | "expert" | "group";
export type ChatRoomStatus = "active" | "closed" | "archived";
export type ChatMemberRole = "owner" | "member" | "moderator";
export type ChatMessageType = "text" | "file" | "system";
export type ChatReportStatus = "open" | "reviewed" | "dismissed" | "actioned";

export type ChatRoomSummary = {
  id: string;
  roomType: ChatRoomType;
  title: string | null;
  status: ChatRoomStatus;
  createdByEmail: string;
  expertId: string | null;
  meetingId: string | null;
  metadata: Record<string, unknown>;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastSenderEmail: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  unreadCount: number;
};

export type ChatRoomMember = {
  id: string;
  roomId: string;
  userEmail: string;
  role: ChatMemberRole;
  muted: boolean;
  joinedAt: string;
  leftAt: string | null;
  lastReadMessageId: string | null;
};

export type ChatAttachment = {
  id: string;
  messageId: string;
  fileUrl: string;
  filePath: string | null;
  mime: string | null;
  sizeBytes: number;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  roomId: string;
  senderEmail: string;
  body: string | null;
  messageType: ChatMessageType;
  deletedAt: string | null;
  createdAt: string;
  attachments: ChatAttachment[];
};

export type ChatReport = {
  id: string;
  roomId: string | null;
  messageId: string | null;
  reporterEmail: string;
  targetEmail: string | null;
  reason: string;
  status: ChatReportStatus;
  handledByEmail: string | null;
  handledAt: string | null;
  createdAt: string;
};

export type ChatBlock = {
  id: string;
  blockerEmail: string;
  blockedEmail: string;
  reason: string | null;
  createdAt: string;
};

export type ChatSearchHit = {
  roomId: string;
  roomTitle: string | null;
  messageId: string;
  senderEmail: string;
  body: string | null;
  createdAt: string;
};
