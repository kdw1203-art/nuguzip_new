/**
 * 반응형 브레이크포인트 — Tailwind 기본 스케일과 동기화.
 *
 * 예전 주석은 "globals.css 미디어 쿼리와 동기화" 라고 적혀 있었는데, globals.css
 * 에는 폭 기반 미디어쿼리가 하나도 없다(있는 건 prefers-reduced-motion 3개뿐).
 * 실제 레이아웃 분기는 전부 Tailwind 유틸리티(`md:` `lg:` `xl:`)로 처리한다.
 * 여기 숫자는 Tailwind v4 기본값과 맞춘 것이다 — md=768, xl=1280.
 * globals.css 의 @theme 에서 --breakpoint-* 를 재정의하면 이 값과 갈라지므로,
 * scripts/check-responsive-qa.mjs 가 그 재정의 여부를 감시한다.
 */

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
