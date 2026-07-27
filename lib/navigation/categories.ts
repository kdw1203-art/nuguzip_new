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

/* ── 2026-07-26: href 를 "지금 실제로 있는 경로"로 맞춤 ───────────────────────
 * 여기 적혀 있던 /inspection/hub·/ai-analysis·/explore·/community·/market·
 * /property-search·/calculators 는 전부 app/ 아래에 없는 경로였다. 미들웨어
 * 리다이렉트(lib/seo/redirect-map.ts)가 받아 주고 있어서 404 는 아니었지만,
 * **사이트에서 제일 많이 눌리는 링크들이 매번 301 한 번을 더 타고 있었다.**
 * 클릭할 때마다 왕복이 한 번씩 더 붙는다는 뜻이다. 그래서 목적지를 직접 가리킨다.
 *
 * 예외 하나: `/presale` 은 리다이렉트조차 없었다 — 홈 퀵메뉴 "청약"이 그냥
 * 404 였다. 청약 화면은 app/apply (청약홈 공공데이터 기반 "청약 센터")다.
 *
 * match 배열에서는 옛 경로를 **지우지 않는다**. 리다이렉트가 살아 있는 동안
 * 옛 URL 로 들어온 사람도 탭 강조가 맞아야 하고, 지워서 얻는 것도 없다.
 * ────────────────────────────────────────────────────────────────────────── */

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
    href: "/notes",
    match: (p) => startsWithAny(p, ["/notes", "/analysis", "/inspection", "/ai-analysis"]),
    tabs: [
      {
        href: "/notes",
        label: "임장",
        match: (p) => startsWithAny(p, ["/notes", "/inspection"]),
      },
      {
        href: "/analysis",
        label: "AI",
        match: (p) => startsWithAny(p, ["/analysis", "/ai-analysis"]),
      },
    ],
  },
  {
    key: "region",
    label: "지도",
    href: "/map",
    match: (p) =>
      startsWithAny(p, [
        "/map",
        "/search",
        "/apply",
        "/complex",
        "/listings",
        // 레거시(리다이렉트로 살아 있는 경로)
        "/explore",
        "/info/map",
        "/property-search",
        "/presale",
      ]),
    tabs: [
      {
        href: "/map",
        label: "지도",
        match: (p) =>
          startsWithAny(p, [
            "/search",
            "/apply",
            "/explore",
            "/info/map",
            "/property-search",
            "/presale",
          ]) || startsWithAny(p, ["/map"]),
      },
      {
        /* `/map/listings` 는 **페이지가 없다** — app/api/map/listings 는 API 라우트고
           app/map 아래에는 하위 디렉터리가 하나도 없다. 리다이렉트 규칙도 없어서
           지도 허브의 "매물" 탭이 그냥 404 였다. 매물 목록 화면은 app/listings 다. */
        href: "/listings",
        label: "매물",
        match: (p) => startsWithAny(p, ["/listings", "/complex"]),
      },
    ],
  },
  {
    key: "community",
    label: "동네이야기",
    href: "/town",
    /* `/town` 아래에는 모임 카테고리(experts·groups·market)도 산다. 그래서
       여기서는 `startsWithAny(p, ["/town"])` 처럼 통째로 잡으면 안 된다 —
       findCategoryByPath 가 배열 순서대로 첫 매치를 돌려주므로 모임 화면이
       "동네이야기"로 잡혀 버린다. 속하는 하위 경로만 이름으로 적는다. */
    match: (p) =>
      p === "/town" ||
      startsWithAny(p, ["/town/write", "/town/news", "/town/library", "/community"]),
    tabs: [
      {
        href: "/town",
        label: "피드",
        match: (p) =>
          p === "/town" ||
          startsWithAny(p, ["/town/news", "/town/library"]) ||
          p === "/community" ||
          (startsWithAny(p, ["/community/"]) && !p.startsWith("/community/write")),
      },
      {
        href: "/town/write",
        label: "글쓰기",
        match: (p) => p.startsWith("/town/write") || p.startsWith("/community/write"),
      },
    ],
  },
  {
    key: "gwangjang",
    label: "모임",
    /* 2026-07-27: href 가 `/town/market` 이었다. 그 경로는 리다이렉트 스텁이라
       헤더의 "모임"을 누르면 한 번 튕겨서 도착했고, 예전 목적지가
       `/town/library`(동네이야기 카테고리)였을 때는 아예 다른 섹션으로
       빠져서 모임 탭줄이 통째로 사라졌다. 대표 화면을 직접 가리킨다. */
    href: "/town/groups",
    match: (p) =>
      startsWithAny(p, [
        "/reports",
        "/town/market",
        "/town/groups",
        "/town/experts",
        // 레거시(리다이렉트로 살아 있는 경로)
        "/market",
        "/meeting-market",
        "/groups",
        "/experts",
      ]),
    tabs: [
      {
        href: "/town/groups",
        label: "모임",
        match: (p) =>
          startsWithAny(p, [
            "/town/groups",
            "/groups",
            // 레거시 경유지 — 여기 도착하면 곧바로 /town/groups 로 넘어간다
            "/town/market",
            "/market",
            "/meeting-market",
          ]),
      },
      /* "마켓" 탭은 삭제했다. href 가 `/town/market?tab=market` 인데 그 경로는
         이제 쿼리를 달고 `/town/groups` 로 리다이렉트되므로, match 조건
         (경로가 여전히 /town/market 이고 tab=market)이 **성립할 수 없었다** —
         눌러서 이동은 되지만 어떤 탭도 강조되지 않는 상태로 남았다.
         마켓 화면 자체도 자료(#8)로 통합돼 별도 화면이 없다. */
      {
        href: "/town/experts",
        label: "전문가",
        match: (p) => startsWithAny(p, ["/town/experts", "/experts"]),
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
    href: "/notes",
    label: "임장",
    shortLabel: "임장",
    match: (p: string) => p.startsWith("/notes") || p.startsWith("/inspection"),
  },
  {
    href: "/analysis",
    label: "AI",
    shortLabel: "AI",
    match: (p: string) => p.startsWith("/analysis") || p.startsWith("/ai-analysis"),
  },
  {
    href: "/map",
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
  { key: "inspection", label: "임장노트", href: "/notes", desc: "AI 자동작성", highlight: true },
  { key: "ai", label: "AI 분석", href: "/analysis", desc: "맞춤형 AI", highlight: true },
  { key: "explore", label: "지도", href: "/map", desc: "시세·실거래" },
  { key: "property", label: "아파트", href: "/search", desc: "매물 조회" },
  { key: "calc", label: "계산기", href: "/calculator", desc: "투자 계산" },
  /* "청약"은 /presale 이었는데 그런 라우트도, 리다이렉트 규칙도 없었다 —
     홈 퀵메뉴에서 누르면 404 였다. 청약 화면은 app/apply 다. */
  { key: "presale", label: "청약", href: "/apply", desc: "분양·경쟁률" },
  { key: "community", label: "동네이야기", href: "/town", desc: "임장 후기·Q&A" },
  { key: "market", label: "모임", href: "/town/groups", desc: "함께 임장" },
] as const;

/** 홈을 제외하고 현재 경로가 속한 통합 카테고리를 찾는다(허브 탭바용). */
export function findCategoryByPath(pathname: string): SiteCategory | undefined {
  const p = pathname.split("?")[0] ?? pathname;
  return SITE_CATEGORIES.find((c) => c.key !== "home" && c.match(p));
}
