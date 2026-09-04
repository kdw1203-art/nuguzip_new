/**
 * [961] 토글 스위치 시각부 — 인터랙션 라이브러리 v2.0 §06.
 * 켜지면 트랙은 네이비, 손잡이는 주홍 온점이 된다 — 브랜드 색이 상태 언어가 되는 사례.
 * 손잡이는 left/right 가 아니라 transform 으로 움직인다(합성 스레드 애니메이션).
 *
 * 이 컴포넌트는 **시각만** 그린다(aria-hidden). 접근성은 감싸는 <button role="switch"
 * aria-checked> 가 맡는다 — 예전 SettingsClient 의 Toggle 과 같은 계약이라 그대로 교체된다.
 */
export function Switch({ on, className = "" }: { on: boolean; className?: string }) {
  return (
    <span className={`njn-switch ${className}`} data-on={on ? "true" : "false"} aria-hidden="true">
      <i />
    </span>
  );
}

export default Switch;
