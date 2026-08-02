import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { apiError } from "@/lib/api/response";
import { ChatUnavailableError } from "@/lib/chat/errors";
import { logger } from "@/lib/log";

/** 재시도까지 권하는 간격(초). lib/api/db-unavailable 과 같은 값. */
const RETRY_AFTER_SECONDS = 30;

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
  /* DB 를 못 읽은 것은 요청이 잘못된 게 아니다. 아래 기본 경로인 400 으로 가면
     "네 요청이 잘못됐다"가 되어 클라이언트가 재시도하지 않고, 원인 메시지가
     그대로 사용자 화면에 노출된다. 503 + Retry-After 만 실제 사실을 말한다. */
  if (e instanceof ChatUnavailableError) {
    logger.error("[db-unavailable] 채팅 저장소", e);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "DB_UNAVAILABLE",
          message: "지금은 채팅을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
        },
      },
      { status: 503, headers: { "Retry-After": String(RETRY_AFTER_SECONDS) } },
    );
  }
  const msg = e instanceof Error ? e.message : "요청 처리 중 오류가 발생했습니다.";
  const map: Record<string, { status: number; code: string; message: string }> = {
    CHAT_ROOM_FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "채팅방 접근 권한이 없습니다." },
    CHAT_ROOM_READ_FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "읽음 처리 권한이 없습니다." },
    CHAT_MESSAGE_DELETE_FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "메시지 삭제 권한이 없습니다." },
    CHAT_REPORT_ADMIN_ONLY: { status: 403, code: "FORBIDDEN", message: "관리자만 처리할 수 있습니다." },
    CHAT_SYSTEM_MESSAGE_FORBIDDEN: { status: 403, code: "FORBIDDEN", message: "시스템 메시지 전송 권한이 없습니다." },
    CHAT_EXPERT_PLAN_REQUIRED: { status: 403, code: "PLAN_REQUIRED", message: "전문가 채팅은 PRO 이상에서 사용할 수 있습니다." },
    CHAT_BLOCK_SELF_NOT_ALLOWED: { status: 400, code: "INVALID_BLOCK", message: "자기 자신은 차단할 수 없습니다." },
    CHAT_BLOCK_TARGET_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "차단할 대상을 이 방에서 찾을 수 없습니다." },
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
    CHAT_GROUP_CLOSED: { status: 409, code: "GROUP_CLOSED", message: "모집이 마감된 모임이라 새로 입장할 수 없어요." },
    CHAT_GROUP_CANCELLED: { status: 409, code: "GROUP_CANCELLED", message: "취소된 모임이라 채팅에 입장할 수 없어요." },
    CHAT_GROUP_FULL: { status: 409, code: "GROUP_FULL", message: "정원이 가득 차 채팅에 입장할 수 없어요." },
    CHAT_EXPERT_ID_REQUIRED: { status: 400, code: "EXPERT_ID_REQUIRED", message: "expertId가 필요합니다." },
    CHAT_GROUP_MEETING_ID_REQUIRED: { status: 400, code: "MEETING_ID_REQUIRED", message: "meetingId가 필요합니다." },
    DIRECT_ROOM_MEMBER_TWO_REQUIRED: { status: 400, code: "DIRECT_ROOM_MEMBER_TWO_REQUIRED", message: "1:1 채팅은 참여자 2명이 필요합니다." },
  };
  const mapped = map[msg];
  if (mapped) return apiError(mapped.code, mapped.message, mapped.status);
  /* 매핑에 없는 오류는 내부 사정(DB 메시지·스택 조각)일 수 있다 — 원문은 서버
     로그로만 남기고 클라이언트에는 일반 문구만 준다(에러 노출 마감 정책). */
  logger.error("[chat] 매핑되지 않은 오류", e);
  return apiError("CHAT_ERROR", "요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", 400);
}
