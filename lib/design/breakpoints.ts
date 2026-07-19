/** 반응형 브레이크포인트 — CSS `globals.css` 미디어 쿼리와 동기화 */

export type Breakpoint = "mobile" | "tablet" | "desktop";

export const BREAKPOINT_PX = {
  mobileMax: 767,
  tabletMin: 768,
  tabletMax: 1279,
  desktopMin: 1280,
} as const;

export const BREAKPOINT_MEDIA = {
  mobile: `(max-width: ${BREAKPOINT_PX.mobileMax}px)`,
  tablet: `(min-width: ${BREAKPOINT_PX.tabletMin}px) and (max-width: ${BREAKPOINT_PX.tabletMax}px)`,
  desktop: `(min-width: ${BREAKPOINT_PX.desktopMin}px)`,
} as const;

/** App Router — headers().get("user-agent") SSR 초기값 힌트 */
export function inferInitialDevice(userAgent: string | null | undefined): "mobile" | "desktop" {
  const ua = userAgent ?? "";
  return /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop";
}

/** SSR 힌트 → breakpoint (tablet은 UA만으로 구분 불가 → mobile 취급) */
export function inferInitialBreakpoint(userAgent: string | null | undefined): Breakpoint {
  return inferInitialDevice(userAgent) === "mobile" ? "mobile" : "desktop";
}
