"use client";

import { useId } from "react";

/* 단지 실거래 가격 추이 차트 (사실 우선 — complex_transactions 실데이터만).
   외부 차트 라이브러리 없이 인라인 SVG로 렌더. 좌→우 = 과거→최신. */

export type PricePoint = {
  /** "YYYYMM" */
  ym: string;
  /** 평균 매매가 (만원) */
  avgManwon: number;
  /** 해당 월 거래 건수 */
  dealCount: number;
};

function fmtEok(manwon: number): string {
  if (!Number.isFinite(manwon) || manwon <= 0) return "—";
  if (manwon >= 10_000) return `${(manwon / 10_000).toFixed(1).replace(/\.0$/, "")}억`;
  return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
}

function ymLabel(ym: string): string {
  if (!ym || ym.length < 6) return ym;
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

/** 부동산 관례: 상승=빨강, 하락=파랑 */
function changeMeta(curr: number, base: number): { pct: string; arrow: string; color: string } {
  if (!base || base <= 0) return { pct: "—", arrow: "", color: "var(--text-3)" };
  const diff = ((curr - base) / base) * 100;
  if (Math.abs(diff) < 0.05) return { pct: "0.0%", arrow: "—", color: "var(--text-3)" };
  return diff > 0
    ? { pct: `${diff.toFixed(1)}%`, arrow: "▲", color: "#e11900" }
    : { pct: `${Math.abs(diff).toFixed(1)}%`, arrow: "▼", color: "#1565d8" };
}

export function PriceTrendChart({ points }: { points: PricePoint[] }) {
  const gradId = useId();
  if (!points || points.length < 2) return null;

  const values = points.map((p) => p.avgManwon);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const first = points[0];
  const last = points[points.length - 1];
  const totalDeals = points.reduce((s, p) => s + (p.dealCount || 0), 0);
  const chg = changeMeta(last.avgManwon, first.avgManwon);

  // SVG 좌표계 (viewBox 기준) — 반응형은 width:100%
  const W = 320;
  const H = 132;
  const padL = 10;
  const padR = 10;
  const padT = 14;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const span = max - min || 1;

  const coords = points.map((p, i) => {
    const x = padL + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
    const y = padT + (1 - (p.avgManwon - min) / span) * innerH;
    return { x, y, p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${(padT + innerH).toFixed(1)} L${coords[0].x.toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  const lastC = coords[coords.length - 1];

  return (
    <div className="card flex flex-col gap-2 rounded-[14px] px-[15px] py-3.5">
      {/* 헤더 — 최신 평균가 + 기간 변동률 */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] text-text-3">실거래 평균 · 최근 {points.length}개월</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[20px] font-extrabold text-ink">{fmtEok(last.avgManwon)}</span>
            <span className="text-[11px] font-bold" style={{ color: chg.color }}>
              {chg.arrow} {chg.pct}
            </span>
          </div>
        </div>
        <div className="text-right text-[10px] text-text-3">
          <div>
            {ymLabel(first.ym)}~{ymLabel(last.ym)}
          </div>
          <div>거래 {totalDeals.toLocaleString("ko-KR")}건</div>
        </div>
      </div>

      {/* 인라인 SVG 차트 */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[132px] w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`실거래 평균가 추이 ${ymLabel(first.ym)}부터 ${ymLabel(last.ym)}까지`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(29,79,216,0.22)" />
            <stop offset="100%" stopColor="rgba(29,79,216,0)" />
          </linearGradient>
        </defs>
        {/* 최고/최저 가이드 라인 */}
        <line x1={padL} y1={padT} x2={W - padR} y2={padT} stroke="#eef1f6" strokeWidth="1" />
        <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="#eef1f6" strokeWidth="1" />
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke="#1d4fd8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 3.5 : 2} fill="#1d4fd8" />
        ))}
        {/* 최신 포인트 강조 링 */}
        <circle cx={lastC.x} cy={lastC.y} r="6" fill="none" stroke="rgba(29,79,216,0.25)" strokeWidth="2" />
      </svg>

      {/* 범위 */}
      <div className="flex items-center justify-between border-t border-[#f0f3f8] pt-2 text-[10px] text-text-3">
        <span>
          최저 <b className="text-text-2">{fmtEok(min)}</b>
        </span>
        <span>국토교통부 실거래가 기준 · 월별 평균</span>
        <span>
          최고 <b className="text-text-2">{fmtEok(max)}</b>
        </span>
      </div>
    </div>
  );
}
