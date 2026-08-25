import { barGeometry } from "@/lib/viz/geometry";

/* 세로 막대 — 거래량·건수처럼 "몇 개인가"를 세는 값.
   최댓값 막대만 진하게 둔다(어디가 정점인지 한 번에 읽히게). */
export function Bars({
  values,
  labels,
  height = 96,
  valueSuffix = "",
  className,
  ariaLabel,
}: {
  values: readonly number[];
  labels?: readonly string[];
  height?: number;
  valueSuffix?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const W = 600;
  const padB = labels?.length ? 16 : 0;
  const plotH = height - padB;
  const g = barGeometry(values, W, plotH);
  if (!g) return null;
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
      aria-label={ariaLabel ?? `막대 차트 — 최대 ${g.max}${valueSuffix}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
    >
      {g.bars.map((b) => (
        <rect
          key={b.index}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx="2"
          fill="currentColor"
          fillOpacity={b.index === g.maxIndex ? 0.95 : 0.34}
        />
      ))}
      {tickIdx.map((i) => (
        <text
          key={i}
          x={i === 0 ? 2 : i === (labels?.length ?? 1) - 1 ? W - 2 : W / 2}
          y={height - 3}
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
