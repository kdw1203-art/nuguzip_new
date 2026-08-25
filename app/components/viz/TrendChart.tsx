import { lineGeometry, smoothPath } from "@/lib/viz/geometry";

/* 추세 차트 — 기능 페이지의 주인공 그림.
 *
 * 왜 필요했나: /analysis/timing·price·temperature·gap 은 2026-08-25 실측 기준
 * SVG 가 **0개**였다. 지수·거래량을 전부 표로만 보여 주니 "지금 오르는 중인가"를
 * 읽으려면 숫자를 눈으로 미분해야 했다(체류 3.2초 · 즉시 이탈).
 *
 * 서버 컴포넌트 · 순수 SVG(클라이언트 JS 0). 선은 currentColor 라 부모가 계열
 * 색을 정한다. 격자·축 라벨은 토큰 색(--divider·--text-3)을 직접 쓴다.
 */
export function TrendChart({
  values,
  labels,
  height = 148,
  smooth = true,
  valueSuffix = "",
  bands = 4,
  className,
  ariaLabel,
}: {
  values: readonly number[];
  /** x축 라벨 — 값과 같은 길이면 처음·중간·끝 3개만 그린다 */
  labels?: readonly string[];
  height?: number;
  smooth?: boolean;
  valueSuffix?: string;
  bands?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const W = 600; // 뷰박스 폭 — preserveAspectRatio=none 으로 컨테이너에 늘린다
  const padT = 10;
  const padB = labels?.length ? 20 : 8;
  const plotH = height - padT - padB;
  const g = lineGeometry(values, W, plotH, 6);
  if (!g) return null;

  const d = smooth ? smoothPath(g.points) : g.line;
  const last = g.points[g.points.length - 1];
  const fmt = (n: number) =>
    `${Math.abs(n) >= 100 ? Math.round(n).toLocaleString("ko-KR") : (Math.round(n * 10) / 10).toLocaleString("ko-KR")}${valueSuffix}`;

  const tickIdx = labels?.length
    ? [0, Math.floor((labels.length - 1) / 2), labels.length - 1].filter(
        (v, i, a) => a.indexOf(v) === i,
      )
    : [];

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel ?? `추세 차트 — 최저 ${fmt(g.min)}, 최고 ${fmt(g.max)}, 현재 ${fmt(g.last)}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
    >
      {/* 격자 — 값을 읽을 수 있게 하는 최소한. 선을 세면 눈금이 된다 */}
      <g stroke="var(--divider)" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {Array.from({ length: bands + 1 }, (_, i) => {
          const y = padT + (plotH / bands) * i;
          return <line key={i} x1="0" y1={y} x2={W} y2={y} />;
        })}
      </g>
      <g transform={`translate(0 ${padT})`}>
        <path d={`${d} L${W} ${plotH} L0 ${plotH} Z`} fill="currentColor" fillOpacity="0.1" />
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* 끝점 — "지금 값"의 위치. 링을 하나 더 둘러 배경 위에서도 보이게 한다 */}
        <circle cx={last.x} cy={last.y} r="5" fill="var(--surface)" />
        <circle cx={last.x} cy={last.y} r="3" fill="currentColor" />
      </g>
      {/* 최고·최저를 왼쪽 위/아래에 붙인다 — 축 눈금 대신 범위만 알려 준다 */}
      <text x="4" y={padT + 10} fill="var(--text-3)" fontSize="10" fontWeight="700">
        {fmt(g.max)}
      </text>
      <text x="4" y={padT + plotH - 2} fill="var(--text-3)" fontSize="10" fontWeight="700">
        {fmt(g.min)}
      </text>
      {tickIdx.map((i) => (
        <text
          key={i}
          x={i === 0 ? 4 : i === (labels?.length ?? 1) - 1 ? W - 4 : W / 2}
          y={height - 5}
          textAnchor={i === 0 ? "start" : i === (labels?.length ?? 1) - 1 ? "end" : "middle"}
          fill="var(--text-3)"
          fontSize="10"
        >
          {labels?.[i]}
        </text>
      ))}
    </svg>
  );
}
