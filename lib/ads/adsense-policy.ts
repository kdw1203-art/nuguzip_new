/**
 * Google AdSense 배치·제외 정책
 * @see https://support.google.com/adsense/answer/9261309 (Auto ads)
 * @see https://support.google.com/adsense/answer/7532444 (ads.txt)
 */

/* [961] 광고 공간 6종 — 소유자 요청(2026-09-03 "광고를 넣을 수 있는 공간").
 *  home_feed        홈 피드 6번째 카드 아래 · 데스크톱 사이드
 *  community_feed   동네이야기·공매·입주·청약·Q&A 목록 사이(8번째마다)
 *  report_free_body 리포트·뉴스 본문 안
 *  article_end      글 본문 끝(임장노트·가이드·용어·뉴스 상세) — 다 읽은 뒤 자연스러운 쉼
 *  page_bottom      페이지 맨 아래(지역·실거래·분석 허브·Q&A 상세)
 *  sidebar          데스크톱 오른쪽 열(홈·실거래·리포트)
 * 각 공간은 AdZone 이 그린다: 애드센스 유닛이 채워지면 그 광고, 안 채워지면 어드민 배너 →
 * 하우스 광고. 제외 경로(/payment·/my…)·광고 없는 플랜에는 어느 쪽도 나가지 않는다. */
export type AdPlacement =
  | "home_feed"
  | "community_feed"
  | "report_free_body"
  | "article_end"
  | "page_bottom"
  | "sidebar";

/** Auto ads + 수동 슬롯 모두 로드하지 않는 경로 prefix */
export const ADSENSE_EXCLUDED_PATH_PREFIXES = [
  "/explore",
  "/map",
  /* 2026-07-26 — `/me` 때와 똑같은 일이 임장노트 작성 화면에서도 있었다.
     여기 적혀 있던 `/inspection/*` 는 이 앱에 없는 경로라 제외가 한 건도
     걸리지 않았고, 정작 작성 중인 노트가 보이는 `/notes/new` 에는 광고가
     붙고 있었다. 옛 경로는 리다이렉트가 살아 있는 동안 그대로 둔다. */
  "/notes/new",
  "/inspection/create",
  "/inspection/session",
  "/inspection/create-schedule",
  "/payment",
  /* H8/J4 — 개인 허브는 `/my` 다. 예전에는 `/me` 가 적혀 있었는데 그런 라우트는 없어서
     제외가 한 건도 걸리지 않았고, 정작 결제·포인트·리드가 보이는 `/my` 에는 광고가 붙었다.
     매칭은 `path === prefix || startsWith(prefix + "/")` 라 `/messages` 를 잡지는 않았다. */
  "/my",
  "/subscription",
  "/pricing",
  "/settings",
  "/auth",
  /* AI 에이전트 채팅 — 대화에 본인 임장노트 내용이 표시되는 개인 화면.
     결제·개인 허브와 같은 이유로 광고 스크립트를 아예 싣지 않는다. */
  "/agent",
] as const;

const PLACEMENT_ENV: Record<AdPlacement, string> = {
  home_feed: "NEXT_PUBLIC_ADSENSE_SLOT_HOME_FEED",
  community_feed: "NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY_FEED",
  report_free_body: "NEXT_PUBLIC_ADSENSE_SLOT_REPORT_BODY",
  article_end: "NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE_END",
  page_bottom: "NEXT_PUBLIC_ADSENSE_SLOT_PAGE_BOTTOM",
  sidebar: "NEXT_PUBLIC_ADSENSE_SLOT_WEB",
};

/* 슬롯 ID 기본값 — 소유자 제공(2026-08-03, "nuguzip" 디스플레이 광고 단위). 페이지 소스에
   노출되는 공개 값이라 기본값으로 둔다. 공간별로 애드센스에서 광고 단위를 따로 만들면
   위 env 이름으로 넣는다(형식: 디스플레이 = auto, 인아티클 = fluid/in-article). */
export const DEFAULT_ADSENSE_SLOT = "9196083291";

/** 공간별 슬롯 ID — env 우선, 없으면 공용 디스플레이 단위 */
export function getSlotForPlacementOrDefault(placement: AdPlacement): string {
  return getSlotForPlacement(placement) ?? DEFAULT_ADSENSE_SLOT;
}

/** 공간별로 전용 단위가 env 에 지정됐는지 — 지정된 경우에만 인아티클 레이아웃을 쓴다 */
export function hasDedicatedSlot(placement: AdPlacement): boolean {
  return Boolean(getSlotForPlacement(placement));
}

/* 게시자 ID — 소유자 제공(2026-08-03, 애드센스 코드 생성기 캡처). 광고 스크립트
   URL·페이지 소스에 그대로 노출되는 공개 식별자라 코드 기본값으로 둔다
   (deploy.yml 의 NEXT_PUBLIC_SUPABASE_URL 하드코딩과 같은 판단 — 비밀 아님).
   env 가 설정돼 있으면 env 가 우선한다(교체 대비). */
const DEFAULT_ADSENSE_CLIENT = "ca-pub-6291134577962996";

export function getAdSenseClient(): string | null {
  const v = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim();
  if (v?.startsWith("ca-pub-")) return v;
  return DEFAULT_ADSENSE_CLIENT;
}

/** ads.txt 용 pub- ID (ca-pub- → pub-) */
export function getAdsTxtPublisherId(): string | null {
  const fromEnv = process.env.ADSENSE_PUBLISHER_ID?.trim();
  if (fromEnv?.startsWith("pub-")) return fromEnv;
  const client = getAdSenseClient();
  if (!client) return null;
  return client.replace(/^ca-pub-/, "pub-");
}

export function getSlotForPlacement(placement: AdPlacement): string | undefined {
  const key = PLACEMENT_ENV[placement];
  const slot = process.env[key]?.trim();
  return slot || undefined;
}

export function isAdsExcludedPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  return ADSENSE_EXCLUDED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** 홈: 6번째 카드 아래 · 커뮤니티: 8번째마다 */
export function shouldInsertFeedAd(
  context: "home" | "community",
  cardIndex: number,
): boolean {
  const n = cardIndex + 1;
  if (context === "home") return n === 6;
  if (context === "community") return n > 0 && n % 8 === 0;
  return false;
}

export function userPlanHasAdFree(plan: string | null | undefined): boolean {
  const p = (plan ?? "free").toLowerCase();
  return p === "pro" || p === "expert" || p === "enterprise";
}
