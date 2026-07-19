import { recordPlatformEvent } from "@/lib/platform-events";
import { detectShellFromUserAgent } from "@/lib/platform-shell";

/** WAID·퍼널용 고정 이벤트명 — `docs/platform-event-taxonomy.md` 와 동기화 */
export const FUNNEL_EVENT = {
  WATCHLIST_ADD: "watchlist_add",
  WATCHLIST_REMOVE: "watchlist_remove",
  INSPECTION_NOTE_CREATE: "inspection_note_create",
  COMMUNITY_POST_CREATE: "community_post_create",
  COMMUNITY_COMMENT_ADD: "community_comment_add",
  EXPERT_CONSULT_SUBMIT: "expert_consult_submit",
  CONTENT_REPORT_SUBMIT: "content_report_submit",
  CHAT_ROOM_OPEN: "chat_room_open",
  CHAT_MESSAGE_SEND: "chat_message_send",
  CHAT_ATTACHMENT_UPLOAD: "chat_attachment_upload",
  CHAT_BLOCK_USER: "chat_block_user",
  CHAT_REPORT_CREATE: "chat_report_create",
  ONBOARDING_STEP_VIEW: "onboarding_step_view",
  ONBOARDING_STEP_COMPLETE: "onboarding_step_complete",
  ONBOARDING_ALL_COMPLETE: "onboarding_all_complete",
  SHARE_LINK_COPY: "share_link_copy",
  AI_TOOL_RUN: "ai_tool_run",
  HOME_AI_CTA_CLICK: "home_ai_cta_click",
  HUB_TO_AI_ANALYSIS: "hub_to_ai_analysis",
  /** 현장 임장 세션 퍼널 (2026 모바일 원탭) */
  FIELD_SESSION_START: "field_session_start",
  FIELD_CAPTURE_COMPLETE: "field_capture_complete",
  FIELD_AI_REPORT_COMPLETE: "field_ai_report_complete",
  FIELD_SHARE_LINK: "field_share_link",
  FIELD_PDF_EXPORT: "field_pdf_export",
  FIELD_COMPARE_ADD: "field_compare_add",
  REPORT_PURCHASE: "report_purchase",
  PWA_INSTALL_PROMPT: "pwa_install_prompt",
  PUSH_SUBSCRIBE: "push_subscribe",
} as const;

const FUNNEL_VERSION = "2026q2";

/**
 * 서버 API에서 퍼널 이벤트를 기록합니다. (광고차단/클라 누락과 무관하게 서버에서 확정)
 */
export async function recordFunnelEvent(
  req: Request,
  input: {
    eventName: string;
    userEmail: string;
    path?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const platform = detectShellFromUserAgent(req.headers.get("user-agent"));
  const metadata = { funnelVersion: FUNNEL_VERSION, ...input.metadata };
  await recordPlatformEvent({
    platform,
    eventName: input.eventName,
    userEmail: input.userEmail,
    path: input.path,
    source: "server_api",
    campaign: "funnel",
    metadata,
  });
}
