/**
 * [961] 로딩 인디케이터 5종 — 인터랙션 라이브러리 v2.0 §01.
 *
 * 상황별로 골라 쓰되 전부 같은 주홍 점 언어다. iOS/Android 기본 스피너는 어떤 앱에서든
 * 같지만, 처마 아래를 도는 온점은 내집나우에서만 본다 — 대기 시간이 브랜드 시간이 된다.
 *
 *  · <OrbitLoader>   궤도형(대표) — 전체화면·긴 로드. 로딩 화면 자체가 로고다.
 *  · <WaveLoader>    파동 — 목록·피드 "더 불러오는 중".
 *  · <RingLoader>    링 — 버튼 내부·소형(ActionButton 이 자체로 쓴다).
 *  · <BarLoader>     바 — 패널 상단·지연 표시(진행률 없음 = 채우지 않는다).
 *  · <LoadingOverlay> 네이비 94% 덮개 + 궤도 + 한 줄 — 지도·실거래처럼 긴 로드에만.
 *  (호흡형은 globals.css 의 .njn-dot--breathe 그대로.)
 *
 * 전부 서버 컴포넌트에서도 쓸 수 있다(순수 마크업 + CSS 애니메이션).
 * reduced-motion 에서는 정지된 채로 보인다(globals.css 등록).
 */

export function OrbitLoader({
  size = 46,
  light = false,
  className = "",
  label = "불러오는 중",
}: {
  size?: number;
  /** 밝은 면 위(라이트 카드) — 처마를 남색으로 */
  light?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`njn-orbit ${light ? "njn-orbit--light" : ""} ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="eave" aria-hidden="true">
        <svg width={Math.round(size * 0.87)} height={Math.round(size * 0.3)} viewBox="0 0 120 40">
          <path
            d="M8 8 C 34 30, 86 30, 112 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <i className="o" aria-hidden="true" />
    </span>
  );
}

export function WaveLoader({ className = "", label = "불러오는 중" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={`njn-wave ${className}`}>
      <i aria-hidden="true" />
      <i aria-hidden="true" />
      <i aria-hidden="true" />
    </span>
  );
}

export function RingLoader({
  ink = false,
  large = false,
  className = "",
  label = "불러오는 중",
}: {
  /** 밝은 면 위 — 회색 트랙 + 주홍 */
  ink?: boolean;
  large?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`njn-ring ${ink ? "njn-ring--ink" : ""} ${large ? "njn-ring--lg" : ""} ${className}`}
    />
  );
}

export function BarLoader({ className = "", label = "불러오는 중" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={`njn-bar ${className}`}>
      <i aria-hidden="true" />
    </span>
  );
}

/** 부모에 position:relative 가 있어야 한다. */
export function LoadingOverlay({ text = "불러오는 중", className = "" }: { text?: string; className?: string }) {
  return (
    <div className={`njn-overlay ${className}`} role="status">
      <OrbitLoader label={text} />
      <span>{text}</span>
    </div>
  );
}
