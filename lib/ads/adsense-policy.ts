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
] as const;

const PLACEMENT_ENV: Record<AdPlacement, string> = {
  home_feed: "NEXT_PUBLIC_ADSENSE_SLOT_HOME_FEED",
  community_feed: "NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY_FEED",
  report_free_body: "NEXT_PUBLIC_ADSENSE_SLOT_REPORT_BODY",
};

export function getAdSenseClient(): string | null {
  const v = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim();
  return v?.startsWith("ca-pub-") ? v : null;
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
