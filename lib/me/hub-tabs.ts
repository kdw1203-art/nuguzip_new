export type MeHubTab =
  | "activity"
  | "inspection"
  | "community"
  | "consult"
  | "membership"
  | "alerts"
  | "expert";

export const ME_HUB_TABS: Array<{
  id: MeHubTab;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    id: "activity",
    label: "내 활동",
    icon: "👀",
    description: "최근 본 단지, 저장, 비교, 다운로드",
  },
  {
    id: "inspection",
    label: "내 임장",
    icon: "📍",
    description: "임장노트, 사진, AI 요약, 공유 링크",
  },
  {
    id: "community",
    label: "내 커뮤니티",
    icon: "💬",
    description: "내가 쓴 글, 댓글, 북마크 글",
  },
  {
    id: "consult",
    label: "내 상담",
    icon: "🤝",
    description: "요청한 상담, 답변 상태, 일정",
  },
  {
    id: "membership",
    label: "멤버십·결제",
    icon: "👑",
    description: "현재 플랜, 결제 이력, 영수증",
  },
  {
    id: "alerts",
    label: "알림·관심",
    icon: "🔔",
    description: "관심 동네, 단지, 알림 규칙",
  },
  {
    id: "expert",
    label: "전문가 모드",
    icon: "🎓",
    description: "인증 상태, 수익, 정산, 프로필",
  },
];

/** 레거시 `?tab=dashboard|interest|activity|membership` 호환 */
export function resolveMeHubTab(raw: string | undefined): MeHubTab {
  switch (raw) {
    case "inspection":
    case "community":
    case "consult":
    case "membership":
    case "alerts":
    case "expert":
      return raw;
    case "interest":
      return "alerts";
    case "dashboard":
    case "activity":
    default:
      return "activity";
  }
}

export function meHubHref(tab: MeHubTab): string {
  return tab === "activity" ? "/me" : `/me?tab=${tab}`;
}
