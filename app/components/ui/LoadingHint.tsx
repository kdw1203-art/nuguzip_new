/**
 * [962] 로딩 힌트 — 스켈레톤만 있으면 "멈춘 화면"과 구분되지 않는다.
 * 온점이 숨쉬는 한 줄로 "지금 불러오는 중"임을 말한다(모션 시스템 §02 리듬).
 * 서버 컴포넌트(loading.tsx)에서 그대로 쓴다.
 */
export function LoadingHint({ text = "지금 불러오는 중", className = "" }: { text?: string; className?: string }) {
  return (
    <div className={`njn-loading-hint ${className}`} role="status" aria-live="polite">
      <span className="njn-dot njn-dot--breathe" aria-hidden="true" />
      {text}
    </div>
  );
}

export default LoadingHint;
