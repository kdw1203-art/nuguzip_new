/* 도넛 — 비율 하나(전세가율·비중)를 원으로. 숫자 옆에 두면 "얼마나 큰가"가 즉시 읽힌다. */
export function Donut({
  ratio,
  size = 64,
  thickness = 8,
  label,
  className,
}: {
  /** 0~1 */
  ratio: number;
  size?: number;
  thickness?: number;
  label?: string;
  className?: string;
}) {
  const t = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={label ?? `${Math.round(t * 100)}%`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--divider)"
        strokeWidth={thickness}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={`${(c * t).toFixed(2)} ${c.toFixed(2)}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {label && (
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
          fontSize={size * 0.26}
          fontWeight="800"
        >
          {label}
        </text>
      )}
    </svg>
  );
}
