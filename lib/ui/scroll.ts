/**
 * [E85] 부드러운 스크롤 — 모션 감소 설정을 존중하는 단 하나의 통로.
 *
 * globals.css 에는 prefers-reduced-motion 블록이 일곱 군데나 있어 CSS 애니메이션은
 * 잘 꺼진다. 그런데 JS 로 부르는 `scrollIntoView({ behavior: "smooth" })` 는
 * CSS 가 닿지 않는다 — 멀미·전정기관 문제로 모션을 꺼 둔 사람에게 화면이
 * 그대로 미끄러진다. 실측으로 여섯 곳이 그대로였다(에이전트 채팅, 노트 덱,
 * 안전 가이드 2곳, 재개발 지도, 질문 작성).
 *
 * 여기 한 곳을 거치면 설정에 따라 즉시 이동으로 바뀐다. **이동 자체는 유지한다**
 * — 스크롤을 아예 안 하면 "새 메시지가 왔는데 안 보이는" 다른 고장이 된다.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** behavior 를 설정에 맞춰 고른다 — smooth 또는 instant(=auto). */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

/** scrollIntoView 를 모션 설정에 맞춰 부른다. */
export function scrollIntoViewSafely(
  el: Element | null | undefined,
  options: Omit<ScrollIntoViewOptions, "behavior"> = {},
): void {
  if (!el) return;
  el.scrollIntoView({ ...options, behavior: scrollBehavior() });
}
