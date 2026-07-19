/**
 * 사이트 카테고리 단일 소스 (5-카테고리).
 *
 *   - 홈
 *   - 임장        = 임장(inspection) + AI 분석(ai-analysis)
 *   - 지도        = explore·매물·단지·분양·시세
 *   - 동네이야기  = community (모임과 분리)
 *   - 모임        = groups·전문가·market·reports
 *
 * 데스크탑 헤더 네비와 통합 허브 탭바(`HubTabBar`)가 모두 이 정의를 사용한다.
 * 모바일 하단 5탭 IA는 AGENTS.md — community는 하단 탭이 아닌 헤더·홈 퀵메뉴 진입.
 */

export type CategoryTab = {
  href: string;
  label: string;
  /** 경로(+선택적 쿼리)로 활성 여부 판별. `/market?tab=` 처럼 쿼리로 화면이 갈리는 탭 대응. */
  match: (p: string, search?: { get(name: string): string | null }) => boolean;
};

export type SiteCategory = {
  key: string;
  label: string;
  /** 카테고리 대표 진입 경로 */
  href: string;
  /** 현재 경로가 이 카테고리에 속하는지 */
  match: (p: string) => boolean;
  /** 허브 탭바에 노출할 하위 탭(2개 이상일 때만 탭바 표시) */
  tabs: CategoryTab[];
};

const startsWithAny = (p: string, prefixes: string[]) =>
  prefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));

export const SITE_CATEGORIES: SiteCategory[] = [
  {
    key: "home",
    label: "홈",
    href: "/",
    match: (p) => p === "/",
    tabs: [],
  },
  {
    key: "imjang-ai",
    label: "임장",
    href: "/inspection/hub",
    match: (p) => startsWithAny(p, ["/inspection", "/ai-analysis"]),
    tabs: [
      {
        href: "/inspection/hub",
        label: "임장",
        match: (p) => startsWithAny(p, ["/inspection"]),
      },
      {
        href: "/ai-analysis",
        label: "AI",
        match: (p) => startsWithAny(p, ["/ai-analysis"]),
      },
    ],
  },
  {
    key: "region",
    label: "지도",
    href: "/explore",
    match: (p) =>
      startsWithAny(p, [
        "/explore",
        "/info/map",
        "/map",
        "/property-search",
        "/presale",
        "/complex",
      ]),
    tabs: [
      {
        href: "/explore",
        label: "지도",
        match: (p) =>
          startsWithAny(p, [
            "/explore",
            "/info/map",
            "/property-search",
            "/presale",
          ]) ||
          (startsWithAny(p, ["/map"]) && !startsWithAny(p, ["/map/listings"])),
      },
      {
        href: "/map/listings",
        label: "매물",
        match: (p) => startsWithAny(p, ["/map/listings", "/complex"]),
      },
    ],
  },
  {
    key: "community",
    label: "동네이야기",
    href: "/community",
    match: (p) => startsWithAny(p, ["/community"]),
    tabs: [
      {
        href: "/community",
        label: "피드",
        match: (p) =>
          p === "/community" ||
          (startsWithAny(p, ["/community/"]) && !p.startsWith("/community/write")),
      },
      {
        href: "/community/write",
        label: "글쓰기",
        match: (p) => p.startsWith("/community/write"),
      },
    ],
  },
  {
    key: "gwangjang",
    label: "모임",
    href: "/market",
    match: (p) =>
      startsWithAny(p, [
        "/reports",
        "/market",
        "/meeting-market",
        "/groups",
        "/experts",
      ]),
    tabs: [
      {
        href: "/market",
        label: "모임",
        match: (p, s) =>
          startsWithAny(p, ["/groups", "/experts"]) ||
          (startsWithAny(p, ["/market", "/meeting-market"]) && s?.get("tab") !== "market"),
      },
      {
        href: "/market?tab=market",
        label: "마켓",
        match: (p, s) =>
          startsWithAny(p, ["/market", "/meeting-market"]) && s?.get("tab") === "market",
      },
      {
        href: "/reports",
        label: "자료실",
        match: (p) => startsWithAny(p, ["/reports"]),
      },
    ],
  },
];

/** 데스크탑 상단 네비에 노출할 카테고리 (홈 포함 5개) */
export const DESKTOP_NAV_CATEGORIES = SITE_CATEGORIES;

/** 모바일 헤더 칩 — 홈 + 임장·AI·지도 (하단 5탭과 정렬) */
export const MOBILE_HEADER_NAV = [
  { href: "/", label: "홈", shortLabel: "홈", match: (p: string) => p === "/" },
  {
    href: "/inspection/hub",
    label: "임장",
    shortLabel: "임장",
    match: (p: string) => p.startsWith("/inspection"),
  },
  {
    href: "/ai-analysis",
    label: "AI",
    shortLabel: "AI",
    match: (p: string) => p.startsWith("/ai-analysis"),
  },
  {
    href: "/explore",
    label: "지도",
    shortLabel: "지도",
    match: SITE_CATEGORIES.find((c) => c.key === "region")!.match,
  },
];

/** 푸터·보조 링크 — 4카테고리 대표만 */
export const FOOTER_CATEGORY_LINKS = SITE_CATEGORIES.filter((c) => c.key !== "home").map(
  (c) => ({
    href: c.href,
    label: c.key === "region" ? "지도" : c.label,
    match: c.match,
  }),
);

/** 홈 8 바로가기 — 라벨·경로 단일 소스 (아이콘은 shared.ts) */
export const HOME_QUICK_LINKS = [
  { key: "inspection", label: "임장노트", href: "/inspection/hub", desc: "AI 자동작성", highlight: true },
  { key: "ai", label: "AI 분석", href: "/ai-analysis", desc: "맞춤형 AI", highlight: true },
  { key: "explore", label: "지도", href: "/explore", desc: "시세·실거래" },
  { key: "property", label: "아파트", href: "/property-search", desc: "매물 조회" },
  { key: "calc", label: "계산기", href: "/calculators", desc: "투자 계산" },
  { key: "presale", label: "청약", href: "/presale", desc: "분양·경쟁률" },
  { key: "community", label: "동네이야기", href: "/community", desc: "임장 후기·Q&A" },
  { key: "market", label: "모임/마켓", href: "/market", desc: "함께 임장" },
] as const;

/** 홈을 제외하고 현재 경로가 속한 통합 카테고리를 찾는다(허브 탭바용). */
export function findCategoryByPath(pathname: string): SiteCategory | undefined {
  const p = pathname.split("?")[0] ?? pathname;
  return SITE_CATEGORIES.find((c) => c.key !== "home" && c.match(p));
}
