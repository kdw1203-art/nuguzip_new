"use client";

import { useEffect, useRef, useState } from "react";

/* 숫자 카운트업 — 화면에 들어올 때 0에서 값까지 굴린다.
 *
 * 규칙 셋:
 *  ① 서버가 그린 **최종 값이 초기 상태**다. 스크립트가 죽어도 숫자는 제자리에
 *     있다(검색 크롤러·JS 차단 환경 포함). 애니메이션은 화면에 들어오는 순간에만.
 *  ② prefers-reduced-motion 이면 아예 굴리지 않는다.
 *  ③ 자릿수가 흔들리면 옆 요소가 밀린다 — tabular-nums(.t-num)와 함께 쓴다.
 */
/** 카운트업 기본 지속 시간(ms) — 손으로 만든 카운트업도 이 값을 쓴다.
 *  (RegionPulseCards 가 750ms 로 따로 적어 같은 화면에 두 속도가 있었다.) */
/* [961] 브랜드 모션 시스템 §06 "숫자가 도착하는 방식" — 900ms ease-out³. 700→900. */
export const COUNTUP_MS = 900;

export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = COUNTUP_MS,
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const fmt = (n: number) =>
    `${prefix}${n.toLocaleString("ko-KR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`;

  const [text, setText] = useState(() => fmt(value));
  const ref = useRef<HTMLSpanElement | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || ran.current || !Number.isFinite(value)) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || ran.current) return;
        ran.current = true;
        io.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          // easeOutCubic — 끝에서 부드럽게 멎는다
          const eased = 1 - Math.pow(1 - p, 3);
          setText(fmt(value * eased));
          if (p < 1) requestAnimationFrame(step);
          else setText(fmt(value));
        };
        requestAnimationFrame(step);
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
    // fmt 는 value/포맷 옵션에서만 파생 — 의존성은 그 원본들로 충분하다
  }, [value, decimals, prefix, suffix, duration]);

  return (
    <span ref={ref} className={`t-num ${className ?? ""}`}>
      {text}
    </span>
  );
}
