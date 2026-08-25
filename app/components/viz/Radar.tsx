import { polygonPoints, radarPoints } from "@/lib/viz/geometry";

export interface RadarAxis {
  key: string;
  label: string;
  /** 0~1 로 정규화된 값 */
  ratio: number;
}

/* 레이더 — 후보 단지 비교의 "모양" 차이. 표는 항목별 우열은 보여 주지만
   전체 성격(어디가 뾰족한 단지인가)은 안 보여 준다. */
export function Radar({
  series,
  size = 190,
  className,
}: {
  /** 최대 3개 — 그 이상은 겹쳐서 못 읽는다 */
  series: ReadonlyArray<{ name: string; axes: readonly RadarAxis[]; toneClass: string }>;
  size?: number;
  className?: string;
}) {
  const first = series[0];
  if (!first || first.axes.length < 3) return null;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 26;
  const n = first.axes.length;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`비교 레이더 — ${series.map((s) => s.name).join(", ")}`}
    >
      {/* 배경 링 4겹 — 값의 대략적 크기를 읽는 눈금 */}
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <polygon
          key={t}
          points={polygonPoints(radarPoints(first.axes.map(() => t), r, cx, cy))}
          fill="none"
          stroke="var(--divider)"
          strokeWidth="1"
        />
      ))}
      {first.axes.map((a, i) => {
        const p = radarPoints(
          first.axes.map((_, j) => (j === i ? 1 : 0)),
          r,
          cx,
          cy,
        )[i];
        return <line key={a.key} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--divider)" strokeWidth="1" />;
      })}
      {series.slice(0, 3).map((s) => (
        <polygon
          key={s.name}
          className={s.toneClass}
          points={polygonPoints(radarPoints(s.axes.map((a) => a.ratio), r, cx, cy))}
          fill="currentColor"
          fillOpacity="0.16"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      ))}
      {first.axes.map((a, i) => {
        const p = radarPoints(
          first.axes.map((_, j) => (j === i ? 1.2 : 0)),
          r,
          cx,
          cy,
        )[i];
        return (
          <text
            key={a.key}
            x={p.x}
            y={p.y}
            textAnchor={p.x > cx + 4 ? "start" : p.x < cx - 4 ? "end" : "middle"}
            dominantBaseline={p.y > cy + 4 ? "hanging" : p.y < cy - 4 ? "auto" : "middle"}
            fill="var(--text-3)"
            fontSize="9.5"
            fontWeight="700"
          >
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
