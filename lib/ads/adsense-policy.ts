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
  "/me",
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
