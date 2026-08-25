import { gaugeArc } from "@/lib/viz/geometry";

/* 반원 게이지 — 0~100 척도(시장 온도·스코어)에 쓴다.
   숫자만 크게 띄우던 자리를 대체한다 — 40px 숫자는 크기만 클 뿐
   "50 이 중립"이라는 척도를 못 보여 준다. */
export function Gauge({
  value,
  max = 100,
  size = 132,
  label,
  caption,
  className,
}: {
  value: number;
  max?: number;
  size?: number;
  /** 게이지 안 큰 글씨 (없으면 value 그대로) */
  label?: string;
  caption?: string;
  className?: string;
}) {
  const safe = Number.isFinite(value) ? value : 0;
  const ratio = max > 0 ? safe / max : 0;
  const H = size * 0.62;
  const cx = size / 2;
  const cy = H - 8;
  const r = size / 2 - 10;
  const track = gaugeArc(1, r, cx, cy);
  const arc = gaugeArc(ratio, r, cx, cy);
  return (
    <div className={`flex flex-col items-center ${className ?? ""}`}>
      <svg
        viewBox={`0 0 ${size} ${H}`}
        width={size}
        height={H}
        role="img"
        aria-label={`${label ?? safe} (${max} 만점)`}
      >
        <path
          d={track.d}
          fill="none"
          stroke="var(--divider)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d={arc.d}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          className="gauge-arc"
        />
        {/* 중립선(척도의 절반) — 이 표시가 없으면 게이지는 그냥 장식이다 */}
        <line
          x1={cx}
          y1={cy - r - 6}
          x2={cx}
          y2={cy - r + 6}
          stroke="var(--text-3)"
          strokeWidth="1.5"
        />
        <circle cx={arc.end.x} cy={arc.end.y} r="4.5" fill="var(--surface)" />
        <circle cx={arc.end.x} cy={arc.end.y} r="3" fill="currentColor" />
      </svg>
      <div className="-mt-3 flex flex-col items-center">
        <span className="t-num text-[22px] leading-none">{label ?? safe}</span>
        {caption && <span className="t-caption mt-1 text-text-3">{caption}</span>}
      </div>
    </div>
  );
}
