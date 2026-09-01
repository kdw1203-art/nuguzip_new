import { sparklinePath } from "./sparkline-path";

/* 허브 카드 스파크라인 — [UI-09] "이 도구가 무슨 숫자를 내는지"를 카드에서 먼저 보여준다.
 *
 * 순수 SVG · 서버 컴포넌트다(클라이언트 JS 0). 색은 currentColor 로 부모의
 * text-* 토큰을 따라간다 — raw hex 를 쓰지 않아 대비 보증 안에 남는다.
 *
 * 좌표 계산은 sparkline-path.ts(순수 함수)에 있고, 값이 모자라면 그쪽이 null 을
 * 낸다 → 여기서도 **아무것도 그리지 않는다**.
 */
export function Sparkline({
  values,
  width = 96,
  height = 26,
  className,
}: {
  values: readonly number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const g = sparklinePath(values, width, height);
  if (!g) return null;
  const [lastX, lastY] = g.last;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
    >
      {/* 면 채움은 현재색의 12% — 선만 있을 때보다 추세 방향이 먼저 읽힌다 */}
      <path d={g.area} fill="currentColor" fillOpacity="0.12" />
      {/* [945-G] 선 드로우-인 — pathLength=1 정규화로 dasharray 1 트릭.
          reduced-motion 은 globals.css .spark-line 등록이 정지시킨다. */}
      <path
        d={g.line}
        pathLength={1}
        className="spark-line"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* 끝점 강조 — "지금 값"이 어디인지 한눈에 */}
      <circle cx={lastX} cy={lastY} r="2.2" fill="currentColor" />
    </svg>
  );
}
