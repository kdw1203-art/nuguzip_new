/** 4대 카테고리 — 동일 디자인 언어 + 임장 중심 decision workflow */

export type WorkflowCategoryId = "inspection" | "ai" | "map" | "community";

export type WorkflowCategory = {
  id: WorkflowCategoryId;
  label: string;
  shortLabel: string;
  href: string;
  /** 임장 워크플로우에서의 역할 */
  role: string;
  accent: string;
};

/** 4허브 섹션 UI 카피 — title·subtitle·CTA 단일 소스 */
export type CategoryHubCopy = {
  badge: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  metaDescription: string;
};

export const CATEGORY_HUB_COPY: Record<WorkflowCategoryId, CategoryHubCopy> = {
  inspection: {
    badge: "임장노트",
    title: "현장에서 바로 남기는 임장 기록",
    subtitle: "사진·체크·음성만 남겨도 AI가 보고서 형태로 정리해드려요",
    ctaLabel: "새 임장노트 시작",
    ctaHref: "/inspection/create",
    metaDescription:
      "현장에서 사진·체크·음성으로 임장을 기록하고 AI가 보고서 형태로 정리해 드립니다.",
  },
  ai: {
    badge: "AI 분석",
    title: "조건을 넣으면 근거까지 정리되는 AI 분석",
    subtitle: "점수보다 중요한 건 왜 그런 판단이 나왔는지입니다",
    ctaLabel: "AI 분석 실행",
    ctaHref: "/ai-analysis/ai-diagnosis",
    metaDescription:
      "단지 조건을 입력하면 근거·리스크·다음 액션까지 정리되는 부동산 AI 분석.",
  },
  map: {
    badge: "지도",
    title: "지도에서 비교하고 주변 정보까지 한눈에",
    subtitle: "실거래·인구·교통·전문가를 한 화면에서 확인하세요",
    ctaLabel: "지도 탐색 시작",
    ctaHref: "/explore#explore-map",
    metaDescription:
      "지도에서 실거래·인구·교통·전문가 정보를 비교하고 임장까지 이어가세요.",
  },
  community: {
    badge: "동네이야기",
    title: "같은 동네 사람들의 실제 이야기",
    subtitle: "후기, 질문, 소식, 사건사고까지 지역 맥락으로 읽어보세요",
    ctaLabel: "글 쓰기",
    ctaHref: "/community/write",
    metaDescription:
      "임장 후기·질문·동네 정보·뉴스를 지역 맥락으로 읽고 나눠 보세요.",
  },
};

export function getCategoryHubCopy(id: WorkflowCategoryId): CategoryHubCopy {
  return CATEGORY_HUB_COPY[id];
}

export const CATEGORY_WORKFLOW: WorkflowCategory[] = [
  {
    id: "inspection",
    label: "임장노트",
    shortLabel: "임장",
    href: "/inspection/hub",
    role: "현장 기록",
    accent: "#3182F6",
  },
  {
    id: "ai",
    label: "AI 분석",
    shortLabel: "AI",
    href: "/ai-analysis",
    role: "근거·판단",
    accent: "#6366F1",
  },
  {
    id: "map",
    label: "지도",
    shortLabel: "지도",
    href: "/explore",
    role: "맥락·비교",
    accent: "#0EA5E9",
  },
  {
    id: "community",
    label: "동네이야기",
    shortLabel: "동네",
    href: "/community",
    role: "검증·공유",
    accent: "#10B981",
  },
];

export const WORKFLOW_VISUAL = {
  surface: "rounded-2xl border border-[#E5E8EB] bg-white shadow-sm",
  surfaceMuted: "rounded-2xl border border-[#E5E8EB] bg-[#F9FAFB]",
  pillActive: "bg-[#3182F6] text-white",
  pillIdle:
    "border border-[#E5E8EB] bg-white text-[#4E5968] hover:border-[#3182F6]/40",
  progressTrack: "h-1.5 rounded-full bg-[#F2F4F6]",
  progressFill: "h-1.5 rounded-full bg-[#3182F6] transition-all",
  primaryBtn:
    "inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#3182F6] px-4 py-3 text-sm font-bold text-white active:scale-[0.98]",
  secondaryBtn:
    "inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-[#E5E8EB] bg-white px-4 py-3 text-sm font-semibold text-[#191F28] active:scale-[0.98]",
} as const;

export type AiPerspectiveId = "live" | "invest" | "gap" | "rent";

export const AI_PERSPECTIVE_PRESETS: {
  id: AiPerspectiveId;
  label: string;
  hint: string;
}[] = [
  { id: "live", label: "실거주", hint: "생활·학군·편의 중심" },
  { id: "invest", label: "투자", hint: "수요·호재·유동성" },
  { id: "gap", label: "갭투자", hint: "전세·매매 스프레드" },
  { id: "rent", label: "임대수익", hint: "월세·수익률·공실" },
];

export type CommunityFormatId =
  | "review"
  | "question"
  | "info"
  | "news"
  | "incident"
  | "school";

export const COMMUNITY_FORMAT_LABELS: Record<CommunityFormatId, string> = {
  review: "후기",
  question: "질문",
  info: "정보",
  news: "뉴스",
  incident: "사건",
  school: "학군",
};

/** 카테고리·제목·태그로 피드 포맷 추론 */
export function inferCommunityFormat(input: {
  category?: string;
  title?: string;
  tags?: string[];
  isAutomated?: boolean;
}): CommunityFormatId {
  if (input.isAutomated) return "news";
  const hay = [input.category ?? "", input.title ?? "", ...(input.tags ?? [])].join(" ");
  if (/질문|Q&A|상담/.test(hay)) return "question";
  if (/후기|입주|거주|체험/.test(hay)) return "review";
  if (/학군|학교/.test(hay)) return "school";
  if (/사건|분양|재건축|정책|뉴스/.test(hay)) return /뉴스|정책/.test(hay) ? "news" : "incident";
  if (/정보|TIP|팁|가이드/.test(hay)) return "info";
  return "info";
}

export function workflowIndex(id: WorkflowCategoryId): number {
  return CATEGORY_WORKFLOW.findIndex((c) => c.id === id);
}

export function nextWorkflowCategory(
  id: WorkflowCategoryId,
): WorkflowCategory | null {
  const i = workflowIndex(id);
  return i >= 0 && i < CATEGORY_WORKFLOW.length - 1
    ? CATEGORY_WORKFLOW[i + 1]!
    : null;
}
