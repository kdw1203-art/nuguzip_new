import { lineGeometry, smoothPath } from "@/lib/viz/geometry";

/* 스파크라인 — 카드 안 작은 추세선. 색은 currentColor(부모 text-* 토큰). */
export function Spark({
  values,
  width = 96,
  height = 26,
  smooth = false,
  showEnd = true,
  className,
}: {
  values: readonly number[];
  width?: number;
  height?: number;
  /** 지수·온도처럼 연속량이면 곡선이 읽기 쉽다 */
  smooth?: boolean;
  showEnd?: boolean;
  className?: string;
}) {
  const g = lineGeometry(values, width, height);
  if (!g) return null;
  const d = smooth ? smoothPath(g.points) : g.line;
  const last = g.points[g.points.length - 1];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
    >
      <path d={`${d} L${width} ${height} L0 ${height} Z`} fill="currentColor" fillOpacity="0.12" />
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {showEnd && <circle cx={last.x} cy={last.y} r="2.2" fill="currentColor" />}
    </svg>
  );
}
