"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { HomeRegionCard } from "@/lib/newui/home-data";

/**
 * 지역 시세 카드 4열 — 정적 숫자 카드를 "살아 있는 계기판"으로.
 *
 *  - 카드 전체가 지도 딥링크(/map?region=…) — 눌러 볼 이유를 만든다.
 *  - 스파크라인: KB 주간 매매가격지수 최근 16주 **실데이터**(market_region_series).
 *    데이터가 없으면 그리지 않는다 — 장식용 가짜 곡선 금지(사실 우선 원칙).
 *  - 가격 숫자는 첫 노출에 카운트업. prefers-reduced-motion 이면 즉시 표시.
 *  - 서버가 만든 문자열(price)을 최종 상태로 그대로 쓴다 — 애니메이션이 끝나면
 *    반올림 차이 없이 서버 값으로 수렴한다.
 */

const SPARK_STROKE: Record<HomeRegionCard["tone"], string> = {
  up: "#d64545",
  down: "#2f6fe4",
  flat: "#96a0b5",
};

const DELTA_CLASS: Record<HomeRegionCard["tone"], string> = {
  up: "delta-up",
  down: "delta-down",
  flat: "delta-flat",
};

function Sparkline({ values, tone }: { values: number[]; tone: HomeRegionCard["tone"] }) {
  if (values.length < 4) return null;
  const w = 120;
  const h = 34;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (h - pad * 2) * (1 - (v - min) / span);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${h - pad} ${line} ${(pad + (values.length - 1) * step).toFixed(1)},${h - pad}`;
  const [ex, ey] = pts[pts.length - 1];
  const stroke = SPARK_STROKE[tone];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="mt-2 h-[34px] w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polygon points={area} fill={stroke} opacity={0.08} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="rp-spark-line"
      />
      <circle cx={ex} cy={ey} r={2.4} fill={stroke} />
      <circle cx={ex} cy={ey} r={2.4} fill={stroke} opacity={0.35} className="rp-spark-pulse" />
    </svg>
  );
}

/** "28.8억" → { num: 28.8, digits: 1, suffix: "억" } — 실패하면 null(카운트업 생략) */
function parsePrice(price: string): { num: number; digits: number; suffix: string } | null {
  const m = /^([0-9]+(?:\.([0-9]+))?)(.*)$/.exec(price.trim());
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return null;
  return { num, digits: m[2]?.length ?? 0, suffix: m[3] ?? "" };
}

function PriceCountUp({ price, active }: { price: string; active: boolean }) {
  const parsed = parsePrice(price);
  const [text, setText] = useState(parsed ? `0${parsed.suffix}` : price);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!parsed || doneRef.current) return;
    if (!active) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      doneRef.current = true;
      setText(price);
      return;
    }
    doneRef.current = true;
    const t0 = performance.now();
    const dur = 750;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      if (p >= 1) {
        setText(price); // 서버 문자열로 수렴
        return;
      }
      setText(`${(parsed.num * eased).toFixed(parsed.digits)}${parsed.suffix}`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, price]);

  return <>{parsed ? text : price}</>;
}

export function RegionPulseCards({ regions }: { regions: HomeRegionCard[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  if (regions.length === 0) return null;

  return (
    <div ref={wrapRef} className="rise-in-2 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {regions.map((r) => (
        <Link
          key={r.id}
          href={r.href}
          aria-label={`${r.name} 평균 ${r.price} ${r.delta} — 지도에서 실거래로 보기`}
          className="group card relative overflow-hidden rounded-2xl px-4 pb-3 pt-4 no-underline transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(29,79,216,.35)] hover:shadow-[0_14px_30px_rgba(16,28,54,.10)]"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-extrabold tracking-tight text-ink">{r.name}</span>
            <span className="rounded-md bg-[rgba(0,0,0,.04)] px-1.5 py-0.5 text-[10px] font-bold text-text-3">
              {r.meta}
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="t-num text-[19px] text-ink">
              <PriceCountUp price={r.price} active={seen} />
            </span>
            <span className={`text-[11px] ${DELTA_CLASS[r.tone]}`}>{r.delta}</span>
          </div>
          {seen && <Sparkline values={r.spark} tone={r.tone} />}
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] text-text-3">
              {r.spark.length >= 4 ? `최근 ${r.spark.length}주 매매지수` : "국토부 실거래 기준"}
            </span>
            <span className="translate-x-1 text-[11px] font-bold text-primary opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
              지도에서 보기 →
            </span>
          </div>
        </Link>
      ))}
      {/* 스파크라인 그리기 애니메이션 — 컴포넌트와 함께 배달되는 지역 스타일 */}
      <style>{`
        .rp-spark-line {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: rp-draw 900ms ease-out forwards;
        }
        .rp-spark-pulse {
          animation: rp-pulse 2.4s ease-out 900ms infinite;
          transform-origin: center;
          transform-box: fill-box;
        }
        @keyframes rp-draw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes rp-pulse {
          0% {
            transform: scale(1);
            opacity: 0.35;
          }
          70% {
            transform: scale(2.6);
            opacity: 0;
          }
          100% {
            transform: scale(2.6);
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rp-spark-line {
            animation: none;
            stroke-dashoffset: 0;
          }
          .rp-spark-pulse {
            animation: none;
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
