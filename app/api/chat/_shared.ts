import { safeAuth } from "@/lib/safe-auth";
import { apiError } from "@/lib/api/response";

export type ChatApiActor = {
  email: string;
  role: "admin" | "user";
  plan: "free" | "pro" | "expert";
};

export async function requireChatActor() {
  const session = await safeAuth();
  const user = session?.user;
  const email = user?.email?.trim().toLowerCase();
  if (!user || !email) {
    return { actor: null, error: apiError("AUTH_REQUIRED", "로그인이 필요합니다.", 401) };
  }
  const role = user.role === "admin" ? "admin" : "user";
  const plan =
    user.plan === "pro" || user.plan === "expert"
      ? user.plan
      : "free";
  const actor: ChatApiActor = { email, role, plan };
  return { actor, error: null };
}

export function toErrorResponse(e: unknown) {
  const msg = e instanceof Error ? e.message : "요청 처리 중 오류가 발생했습니다.";
  const map: Record<string, { status: number; code: string; message: string }> = {
    CHAT_ROOM_FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "채팅방 접근 권한이 없습니다." },
    CHAT_ROOM_READ_FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "읽음 처리 권한이 없습니다." },
    CHAT_MESSAGE_DELETE_FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "메시지 삭제 권한이 없습니다." },
    CHAT_REPORT_ADMIN_ONLY: { status: 403, code: "FORBIDDEN", message: "관리자만 처리할 수 있습니다." },
    CHAT_SYSTEM_MESSAGE_FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "시스템 메시지 전송 권한이 없습니다." },
    CHAT_EXPERT_PLAN_REQUIRED: { status: 403, code: "PLAN_REQUIRED", message: "전문가 채팅은 PRO 이상에서 사용할 수 있습니다." },
    CHAT_BLOCK_SELF_NOT_ALLOWED: { status: 400, code: "INVALID_BLOCK", message: "자기 자신은 차단할 수 없습니다." },
    CHAT_MESSAGE_EMPTY: { status: 400, code: "INVALID_MESSAGE", message: "메시지 내용 또는 첨부가 필요합니다." },
    CHAT_BLOCKED_USER: { status: 400, code: "BLOCKED_USER", message: "차단 사용자와는 메시지를 보낼 수 없습니다." },
    CHAT_OFF_PLATFORM_BLOCKED: {
      status: 400,
      code: "OFF_PLATFORM_BLOCKED",
      message:
        "플랫폼 외 결제·계좌·연락처 유도는 전문가 운영정책상 제한됩니다. 플랫폼 내 상담·결제를 이용해 주세요.",
    },
    CHAT_REPORT_REASON_REQUIRED: { status: 400, code: "REASON_REQUIRED", message: "신고 사유를 입력해 주세요." },
    CHAT_MESSAGE_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "메시지를 찾을 수 없습니다." },
    CHAT_EXPERT_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "전문가 정보를 찾을 수 없습니다." },
    CHAT_GROUP_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "모임 정보를 찾을 수 없습니다." },
    CHAT_EXPERT_ID_REQUIRED: { status: 400, code: "EXPERT_ID_REQUIRED", message: "expertId가 필요합니다." },
    CHAT_GROUP_MEETING_ID_REQUIRED: { status: 400, code: "MEETING_ID_REQUIRED", message: "meetingId가 필요합니다." },
    DIRECT_ROOM_MEMBER_TWO_REQUIRED: { status: 400, code: "DIRECT_ROOM_MEMBER_TWO_REQUIRED", message: "1:1 채팅은 참여자 2명이 필요합니다." },
  };
  const mapped = map[msg];
  if (mapped) return apiError(mapped.code, mapped.message, mapped.status);
  return apiError("CHAT_ERROR", msg, 400);
}
