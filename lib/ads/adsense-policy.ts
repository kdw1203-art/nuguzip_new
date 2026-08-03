/**
 * Google AdSense 배치·제외 정책
 * @see https://support.google.com/adsense/answer/9261309 (Auto ads)
 * @see https://support.google.com/adsense/answer/7532444 (ads.txt)
 */

export type AdPlacement = "home_feed" | "community_feed" | "report_free_body";

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
};

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
