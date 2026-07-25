/**
 * 광고 제거 대상 플랜 판정 — 서버(AdSlot·getAdViewer)와 클라이언트(AdFreeGate)가
 * 같은 기준을 쓰도록 순수 함수로 분리. "광고 제거"는 pro 이상 유료 플랜의 혜택이다
 * (plans.ts 기능표 기준). DB 는 무료를 'free' 로 쓰지만 'basic' 별칭도 무료로 본다.
 */
export function isAdFreePlan(plan: string | null | undefined): boolean {
  const p = (plan ?? "").trim().toLowerCase();
  return p === "pro" || p === "expert" || p === "enterprise";
}
