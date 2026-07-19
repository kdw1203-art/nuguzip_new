/**
 * 제품 초점: 핵심 루프 vs 그 외 노출 등급.
 * 상세 매핑·운영 리듬은 docs/product-core-focus.md 참고.
 */

export type FeatureSurfaceTier = "core" | "beta" | "explore";

/** 한 문장 핵심 루프 + ICP (플랜의 define-core-loop) */
export const CORE_PRODUCT_LOOP = {
  icp: "실거주·첫 임장을 앞둔 구매자(또는 관심 지역이 생긴 사용자)",
  situation: "단지·지역 정보는 흩어져 있고, 현장에서 무엇을 남겨야 할지 막막한 상태",
  success:
    "임장 노트를 남기고 AI 분석까지 마쳐 다음 행동이 정리된 채로 이탈한다",
  oneLiner:
    "관심 동네가 생긴 사람이 임장 기록과 AI 분석으로 맥락을 쌓고, 그 한 사이클을 끝까지 완주한다",
} as const;

export const SURFACE_TIER_LABEL: Record<FeatureSurfaceTier, string> = {
  core: "",
  beta: "시험 중",
  explore: "준비 중",
};

/** 허브 상단 안내 문구 — core 는 노출하지 않음 */
export const SURFACE_TIER_NOTICE: Record<FeatureSurfaceTier, string | null> = {
  core: null,
  beta: "아직 다듬는 중이에요. 화면과 결과는 바뀔 수 있어요.",
  explore: "곳곳에 채워 넣는 단계예요. 지역·주제를 좁혀 키워 갑니다.",
};

const TIER_RULES_RAW: { prefix: string; tier: FeatureSurfaceTier }[] = [
  { prefix: "/reports", tier: "beta" },
  { prefix: "/market", tier: "explore" },
  { prefix: "/experts", tier: "explore" },
  { prefix: "/groups", tier: "explore" },
  { prefix: "/properties", tier: "explore" },
  { prefix: "/investment-tools", tier: "explore" },
  { prefix: "/calculators", tier: "explore" },
  { prefix: "/info/redevelopment", tier: "explore" },
  { prefix: "/create-expert", tier: "explore" },
  { prefix: "/content-market", tier: "explore" },
  { prefix: "/meeting-market", tier: "explore" },
  { prefix: "/create-meeting-market", tier: "explore" },
];
const TIER_RULES = [...TIER_RULES_RAW].sort((a, b) => b.prefix.length - a.prefix.length);

export function getSurfaceTier(pathname: string): FeatureSurfaceTier {
  const p = pathname.split("?")[0] ?? pathname;
  for (const { prefix, tier } of TIER_RULES) {
    if (p === prefix || p.startsWith(`${prefix}/`)) return tier;
  }
  return "core";
}

export function surfaceBadgeText(tier: FeatureSurfaceTier): string | null {
  const t = SURFACE_TIER_LABEL[tier];
  return t || null;
}

/** 상단 네비 1열(핵심 루프에 직접 연결) */
export const PRIMARY_NAV_PATHS = ["/", "/inspection", "/ai-analysis", "/explore"] as const;

/** 더보기 메뉴: 접근은 유지하되 기대치를 낮춤 */
export const SECONDARY_NAV_ITEMS: {
  href: string;
  label: string;
  tier: FeatureSurfaceTier;
}[] = [
  { href: "/community", label: "동네", tier: "core" },
  { href: "/market", label: "동네장터", tier: "explore" },
  { href: "/reports", label: "자료실", tier: "beta" },
  { href: "/experts", label: "전문가", tier: "explore" },
];

/** 공개(production) 네비 — core 메뉴만 */
export const PUBLIC_SECONDARY_NAV_ITEMS = SECONDARY_NAV_ITEMS.filter(
  (item) => item.tier === "core",
);

/** 홈 퀵메뉴 레일(`HomeQuickRail`)에 노출할 경로 — `QUICK_MENUS`와 동일한 8경로·순서 유지 */
export const HOME_PRIMARY_QUICK_PATHS = [
  "/inspection/hub",
  "/ai-analysis",
  "/explore",
  "/property-search",
  "/calculators",
  "/presale",
  "/community",
  "/market",
] as const;

/** set-loop-metrics: 주간 리뷰에 고정할 지표(팀이 스프레드시트/대시보드에 옮겨 적기) */
export const LOOP_REVIEW_METRICS = [
  {
    id: "inspection_note_completed",
    label: "임장 노트·허브 완료 세션 수",
    rhythm: "매주 월요일",
    hint: "예: 노트 저장·공유 링크 생성 등 루프 끝 이벤트 1종을 골라 집계",
  },
  {
    id: "community_posts_new",
    label: "커뮤니티 신규 글 수",
    rhythm: "매주 월요일",
    hint: "동네 이야기가 비어 보이지 않게 하는 최소 박동",
  },
  {
    id: "ai_run_completed",
    label: "AI 분석 실행·노트 연동 수",
    rhythm: "매주 월요일",
    hint: "AI 도구 실행 완료 또는 임장 노트에서 AI 분석 진입 이벤트",
  },
] as const;
