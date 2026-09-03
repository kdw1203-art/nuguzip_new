"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { HomeRegionCard } from "@/lib/newui/home-data";
import { COUNTUP_MS } from "@/app/components/motion/CountUp";

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
  /* SVG stroke 라 토큰 클래스를 못 쓴다 — 2026-07-27 대비 정정 팔레트의 현재 값 */
  up: "#c62828",
  down: "#2f6fe4",
  flat: "#96a0b5",
};

const DELTA_CLASS: Record<HomeRegionCard["tone"], string> = {
  up: "delta-up",
  down: "delta-down",
  flat: "delta-flat",
};

function Sparkline({
  values,
  tone,
  animate,
}: {
  values: number[];
  tone: HomeRegionCard["tone"];
  /** 뷰포트 진입 후 true — 그리기 애니메이션 트리거(페인트만 바뀌고 레이아웃은 불변) */
  animate: boolean;
}) {
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
        className={animate ? "rp-spark-line" : "rp-spark-wait"}
      />
      <circle cx={ex} cy={ey} r={2.4} fill={stroke} opacity={animate ? 1 : 0} />
      {animate && (
        <circle cx={ex} cy={ey} r={2.4} fill={stroke} opacity={0.35} className="rp-spark-pulse" />
      )}
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
  /* [E75] 초기 상태는 **서버가 그린 최종 값**이다.
     예전에는 `0${suffix}` 로 시작했다. 클라이언트 컴포넌트도 첫 렌더는 서버에서
     그려지므로, 그 초깃값이 곧 홈의 서버 HTML 에 들어가는 시세가 된다 —
     지역 카드가 있는 홈이라면 마크업상 전부 "0억"이다. 크롤러와 JS 가 죽은
     환경에서는 그 0억이 우리가 말한 시세다. 애니메이션 편의를 위해 없는 숫자를
     마크업에 남길 이유가 없다.
     (근거는 코드 계약이다 — 이 샌드박스는 지역 시세 조회가 비어 있어
      화면으로는 재현하지 못했다. app/components/motion/CountUp.tsx 의 규칙 ①
      이 같은 이유로 최종 값을 초기 상태로 두고 있다 — 그 계약에 맞춘다.) */
  const [text, setText] = useState(price);
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
    /* 지속 시간은 공용 카운트업과 같은 값을 쓴다 — 예전엔 750ms 로 따로 적혀
       있어 같은 화면 안에서 700ms 와 750ms 두 속도가 돌았다. */
    const dur = COUNTUP_MS;
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
            <span className="rounded-md bg-[rgba(0,0,0,.04)] px-1.5 py-0.5 t-caption font-bold text-text-3">
              {r.meta}
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="t-num text-[19px] text-ink">
              <PriceCountUp price={r.price} active={seen} />
            </span>
            <span className={`text-[12px] ${DELTA_CLASS[r.tone]}`}>{r.delta}</span>
          </div>
          {/* CLS 방지 — 스파크라인은 SSR부터 자리를 차지하고(레이아웃 불변),
              뷰포트에 들어오면 그리기 애니메이션만 시작한다(페인트 변화만). */}
          <Sparkline values={r.spark} tone={r.tone} animate={seen} />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="t-caption text-text-3">
              {r.spark.length >= 4 ? `최근 ${r.spark.length}주 매매지수` : "국토부 실거래 기준"}
            </span>
            <span className="translate-x-1 text-[12px] font-bold text-primary opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
              지도에서 보기 →
            </span>
          </div>
        </Link>
      ))}
      {/* 스파크라인 그리기 애니메이션 — 컴포넌트와 함께 배달되는 지역 스타일 */}
      <style>{`
        .rp-spark-wait {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
        }
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
