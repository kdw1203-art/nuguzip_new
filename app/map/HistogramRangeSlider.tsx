"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/* ============================================================
   막대그래프 위에서 끌어 쓰는 범위 슬라이더 (지도 상세 필터)

   왜 칩이 아니라 이걸 쓰나: 예전 필터는 "5억 이하 / 5~10억 / 10~15억" 같은
   고정 칩이었다. 구간이 남의 기준이라 "지금 이 동네에서 6~9억"을 고를 수 없었고,
   무엇보다 **그 구간에 몇 개가 있는지 모른 채** 눌러야 했다. 눌러 보고 0건이면
   되돌리는 식이었다.

   막대그래프를 깔면 두 가지가 동시에 해결된다.
     · 지금 보이는 지역의 실제 분포가 보인다(어디에 몰려 있는지)
     · 손잡이를 끌면 잘리는 범위가 즉시 눈에 보인다
   막대는 서버가 준 실측 분포다(map_filter_facets). 만들어 낸 모양이 아니다.

   접근성: 손잡이 두 개 모두 키보드로 조작 가능(←/→, Home/End)하고
   role="slider" + aria-valuenow 를 준다. 마우스 없이도 같은 일을 할 수 있어야 한다.
   ============================================================ */

export interface HistogramRangeSliderProps {
  label: string;
  /** 축 최솟값·최댓값 (서버가 준 1~99% 범위) */
  lo: number;
  hi: number;
  /** 구간별 개수 — 길이가 구간 수. 서버에서 조밀 배열로 온다(0 포함). */
  bins: number[];
  /** 현재 선택 범위. null 이면 해당 끝은 제한 없음 */
  value: [number | null, number | null];
  onChange: (next: [number | null, number | null]) => void;
  /** 값 → 표시 문자열 (억/㎡/년/세대) */
  format: (v: number) => string;
  /** 이 축의 값을 가진 단지 수 — 값이 없는 단지가 많으면 정직하게 알린다 */
  available?: number;
  total?: number;
  /** 눈금 간격 (정수 축이면 1) */
  step?: number;
}

/** 값 → 0..1 위치 */
function toPct(v: number, lo: number, hi: number): number {
  if (hi <= lo) return 0;
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}

export function HistogramRangeSlider({
  label,
  lo,
  hi,
  bins,
  value,
  onChange,
  format,
  available,
  total,
  step = 1,
}: HistogramRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<"min" | "max" | null>(null);

  // null(제한 없음) 은 축 끝으로 그린다 — 손잡이가 사라지면 잡을 수가 없다.
  const vMin = value[0] ?? lo;
  const vMax = value[1] ?? hi;
  const maxBin = useMemo(() => Math.max(1, ...bins), [bins]);

  const clampToStep = useCallback(
    (v: number) => {
      const snapped = Math.round(v / step) * step;
      return Math.min(hi, Math.max(lo, snapped));
    },
    [lo, hi, step],
  );

  /** 포인터 x → 축 값 */
  const valueAtClientX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el) return lo;
      const r = el.getBoundingClientRect();
      if (r.width <= 0) return lo;
      const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      return clampToStep(lo + p * (hi - lo));
    },
    [lo, hi, clampToStep],
  );

  const commit = useCallback(
    (which: "min" | "max", raw: number) => {
      const v = clampToStep(raw);
      if (which === "min") {
        const next = Math.min(v, vMax);
        // 축 끝에 닿으면 "제한 없음"으로 되돌린다 — 끝까지 민 것과 조건을
        // 걸지 않은 것은 같은 뜻이고, 그래야 필터 배지도 정직해진다.
        onChange([next <= lo ? null : next, value[1]]);
      } else {
        const next = Math.max(v, vMin);
        onChange([value[0], next >= hi ? null : next]);
      }
    },
    [clampToStep, lo, hi, vMin, vMax, onChange, value],
  );

  const onPointerDown = (which: "min" | "max") => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(which);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    commit(dragging, valueAtClientX(e.clientX));
  };
  const endDrag = () => setDragging(null);

  const onKey = (which: "min" | "max") => (e: React.KeyboardEvent) => {
    const cur = which === "min" ? vMin : vMax;
    const big = Math.max(step, Math.round((hi - lo) / 20));
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + step;
    else if (e.key === "PageDown") next = cur - big;
    else if (e.key === "PageUp") next = cur + big;
    else if (e.key === "Home") next = lo;
    else if (e.key === "End") next = hi;
    if (next === null) return;
    e.preventDefault();
    commit(which, next);
  };

  const leftPct = toPct(vMin, lo, hi) * 100;
  const rightPct = toPct(vMax, lo, hi) * 100;
  const narrowed = value[0] !== null || value[1] !== null;

  // 축 자체가 성립하지 않으면(값 있는 단지가 없음) 슬라이더를 그리지 않는다.
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo || bins.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <div className="text-[11px] font-bold text-text-3">{label}</div>
        <div className="text-[11px] text-text-3">
          이 지역에는 아직 값이 있는 단지가 없어요
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold text-text-3">{label}</span>
        <span className={`text-[11px] font-bold ${narrowed ? "text-primary" : "text-text-3"}`}>
          {format(vMin)} ~ {format(vMax)}
          {value[1] === null && hi > vMin ? "+" : ""}
        </span>
      </div>

      {/* 막대그래프 — 선택 범위 밖은 흐리게 해서 "지금 자르면 뭐가 빠지는지" 보이게 */}
      <div className="flex h-[38px] items-end gap-[2px]" aria-hidden="true">
        {bins.map((c, i) => {
          const binLo = lo + ((hi - lo) * i) / bins.length;
          const binHi = lo + ((hi - lo) * (i + 1)) / bins.length;
          const inSel = binHi >= vMin && binLo <= vMax;
          return (
            <div
              key={i}
              className={`flex-1 rounded-t-[2px] transition-colors ${
                inSel ? "bg-primary" : "bg-[rgba(16,28,54,.12)]"
              }`}
              style={{ height: `${Math.max(2, (c / maxBin) * 100)}%`, opacity: inSel ? 0.85 : 1 }}
            />
          );
        })}
      </div>

      {/* 트랙 + 손잡이 두 개 */}
      <div
        ref={trackRef}
        className="relative h-5 touch-none select-none"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[rgba(16,28,54,.12)]" />
        <div
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
        />
        {(
          [
            ["min", leftPct, vMin],
            ["max", rightPct, vMax],
          ] as const
        ).map(([which, pct, v]) => (
          <div
            key={which}
            role="slider"
            tabIndex={0}
            aria-label={`${label} ${which === "min" ? "최소" : "최대"}`}
            aria-valuemin={lo}
            aria-valuemax={hi}
            aria-valuenow={v}
            aria-valuetext={format(v)}
            onPointerDown={onPointerDown(which)}
            onKeyDown={onKey(which)}
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-[1.5px] border-primary bg-surface shadow-[0_2px_6px_rgba(16,28,54,.25)] focus:outline-none focus:ring-2 focus:ring-primary/40 active:cursor-grabbing"
            style={{ left: `${pct}%` }}
          />
        ))}
      </div>

      {/* 값이 없는 단지가 많으면 숨기지 않고 적는다 — 필터가 "없는 값"을
          조건 불만족으로 취급하지 않는다는 사실을 사용자가 알아야 한다. */}
      {available !== undefined && total !== undefined && available < total && (
        <div className="text-[10px] leading-[1.5] text-text-3">
          이 값이 있는 단지 {available.toLocaleString("ko-KR")}개 / 화면 안{" "}
          {total.toLocaleString("ko-KR")}개 · 값이 없는 단지는 이 조건으로 걸러지지 않아요
        </div>
      )}
    </div>
  );
}
