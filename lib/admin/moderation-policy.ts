/**
 * 콘텐츠 모더레이션 운영 흐름 (관리자 UI·온보딩용 상수).
 *
 * flowchart: 게시 → 자동 필터 → 위험 신호? → (예) 임시 블라인드 → 운영 큐 → 승인/수정/반려
 */

export type ModerationStageId =
  | "publish"
  | "auto_filter"
  | "risk_gate"
  | "blind"
  | "review_queue"
  | "approve"
  | "revise"
  | "reject";

export type ModerationStage = {
  id: ModerationStageId;
  label: string;
  description: string;
};

export const MODERATION_PIPELINE: ModerationStage[] = [
  {
    id: "publish",
    label: "사용자 게시",
    description: "커뮤니티·모임·댓글 등 UGC 생성",
  },
  {
    id: "auto_filter",
    label: "자동 필터",
    description: "금칙어·패턴·신고 누적 임계값",
  },
  {
    id: "risk_gate",
    label: "위험 신호 판별",
    description: "허위 정보·사기·명예훼손 키워드",
  },
  {
    id: "blind",
    label: "임시 블라인드",
    description: "검토 전 비공개 또는 피드 제외",
  },
  {
    id: "review_queue",
    label: "운영 검토 큐",
    description: "/admin/reports · 신고량·카테고리 정렬",
  },
  {
    id: "approve",
    label: "승인·복구",
    description: "즉시 게시 또는 공개 전환",
  },
  {
    id: "revise",
    label: "수정 요청",
    description: "작성자 재제출 후 재검토",
  },
  {
    id: "reject",
    label: "반려·제재",
    description: "삭제·경고·계정 제재(app_users.is_banned)",
  },
];

/** content_reports.status → 파이프라인 단계 매핑 */
export function reportStatusToStage(status: string): ModerationStageId {
  switch (status) {
    case "open":
    case "pending":
      return "review_queue";
    case "reviewed":
    case "sent":
      return "approve";
    case "dismissed":
      return "reject";
    default:
      return "review_queue";
  }
}
