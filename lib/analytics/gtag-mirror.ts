/**
 * 선택 GA4 미러.gtag 로드 후에만 동작. Supabase `platform_activity_events` 가 1차 진실.
 * 이벤트명은 `docs/platform-event-taxonomy.md` 의 `event_name` 과 동일하게 둔다.
 */
export function mirrorFunnelToGtag(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>,
): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_GA4_ID) return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== "function") return;
  gtag("event", eventName, params ?? {});
}
