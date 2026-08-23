"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * A1 — 첫 방문 코치마크 투어.
 *
 * 화면의 실제 DOM 요소를 `data-tour="<key>"` 로 찍어두면 그 위치에 스포트라이트를
 * 뚫고 말풍선을 띄운다. 대상이 화면에 없으면(반응형으로 숨겨진 버튼 등) 그 스텝은
 * 건너뛴다 — 모바일에서 없는 UI 를 가리키는 화살표만 남는 게 최악이라서.
 *
 * 완료 여부는 두 곳에 남긴다:
 *  - localStorage: 비로그인/즉시 반영용
 *  - POST /api/me/tours: 로그인 사용자 크로스디바이스용
 * 둘 중 하나라도 "봤다"면 다시 뜨지 않는다.
 */

export type CoachmarkStep = {
  /** 대상 요소의 data-tour 값. 없으면 화면 중앙에 띄운다. */
  target?: string;
  title: string;
  body: string;
  /**
   * 대상이 화면에 없어도 스텝을 유지할지. 기본은 false(생략).
   * 내용 자체가 UI 위치와 무관하게 꼭 전해야 하는 안내(예: 가격 기준 설명)면 true —
   * 이때는 화면 중앙 카드로 뜬다.
   */
  keepIfMissing?: boolean;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;

function readLocalSeen(tourId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(`nz_tour_${tourId}`) === "1";
  } catch {
    return false;
  }
}

function writeLocalSeen(tourId: string) {
  try {
    window.localStorage.setItem(`nz_tour_${tourId}`, "1");
  } catch {
    // 사파리 프라이빗 모드 등 — 서버 기록으로 충분
  }
}

/**
 * 같은 data-tour 키가 여러 번 렌더될 수 있다 (반응형으로 헤더용/모바일용을
 * 둘 다 마크업에 두고 CSS 로 하나만 보이게 하는 패턴 — 지도 필터바가 그렇다).
 * querySelector 로 첫 번째만 잡으면 숨겨진 쪽을 집어 스텝이 통째로 사라지므로,
 * 전부 훑어서 실제로 보이는 것을 고른다.
 */
function measure(target?: string): Rect | null {
  if (!target) return null;
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // 화면 밖(반응형으로 접힌 영역)은 대상으로 치지 않는다.
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    if (r.right < 0 || r.left > window.innerWidth) continue;
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }
  return null;
}

export function CoachmarkTour({
  tourId,
  steps,
  enabled = true,
  onFinish,
}: {
  tourId: string;
  steps: CoachmarkStep[];
  enabled?: boolean;
  onFinish?: (reason: "done" | "skip") => void;
}) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const finishedRef = useRef(false);

  // 표시 가능한 스텝만 남긴다 (대상이 실제로 화면에 있는 것 + 대상 없는 안내 스텝)
  const [visibleSteps, setVisibleSteps] = useState<CoachmarkStep[]>([]);

  useEffect(() => {
    if (!enabled || steps.length === 0) return;
    if (readLocalSeen(tourId)) return;
    let cancelled = false;

    // 서버에 이미 본 기록이 있으면 띄우지 않는다 (다른 기기에서 본 경우)
    (async () => {
      try {
        const res = await fetch("/api/me/tours", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { seen?: string[] };
          if (Array.isArray(data.seen) && data.seen.includes(tourId)) {
            writeLocalSeen(tourId);
            return;
          }
        }
      } catch {
        // 조회 실패 시엔 localStorage 기준으로만 판단
      }
      if (cancelled) return;
      // 지도·차트가 그려질 시간을 준 뒤 대상 존재 여부를 확정한다.
      window.setTimeout(() => {
        if (cancelled) return;
        const usable = steps.filter((s) => !s.target || s.keepIfMissing || measure(s.target));
        if (usable.length === 0) return;
        setVisibleSteps(usable);
        setIndex(0);
        setActive(true);
      }, 900);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, steps, tourId]);

  const step = active ? visibleSteps[index] : undefined;

  const sync = useCallback(() => {
    if (!step) return;
    setRect(measure(step.target));
  }, [step]);

  useLayoutEffect(() => {
    if (!active) return;
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [active, sync]);

  const finish = useCallback(
    (reason: "done" | "skip") => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setActive(false);
      writeLocalSeen(tourId);
      void fetch("/api/me/tours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tour: tourId }),
      }).catch(() => {});
      void fetch("/api/platform/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: reason === "done" ? "onboarding_tour_complete" : "onboarding_tour_skip",
          source: "client",
          campaign: "funnel",
          path: typeof window !== "undefined" ? window.location.pathname : undefined,
          metadata: { tourId, stepIndex: index, totalSteps: visibleSteps.length },
        }),
      }).catch(() => {});
      onFinish?.(reason);
    },
    [index, onFinish, tourId, visibleSteps.length],
  );

  // ESC 로 닫기 — 모달 a11y 관례
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish("skip");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  if (!active || !step) return null;

  const isLast = index >= visibleSteps.length - 1;
  const next = () => (isLast ? finish("done") : setIndex((i) => i + 1));

  // 말풍선 위치 — 대상 아래가 기본, 화면 아래로 넘치면 위로 뒤집는다.
  const bubbleWidth = 280;
  let bubbleTop = rect ? rect.top + rect.height + PAD + 6 : 0;
  let bubbleLeft = rect ? rect.left + rect.width / 2 - bubbleWidth / 2 : 0;
  let centered = !rect;
  if (rect && typeof window !== "undefined") {
    if (bubbleTop + 190 > window.innerHeight) {
      bubbleTop = Math.max(12, rect.top - 190);
    }
    bubbleLeft = Math.min(
      Math.max(12, bubbleLeft),
      Math.max(12, window.innerWidth - bubbleWidth - 12),
    );
  } else {
    centered = true;
  }

  return (
    <div
      className="fixed inset-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-label="첫 방문 안내"
    >
      {/* 딤 + 스포트라이트: box-shadow 로 구멍을 뚫어 대상만 밝게 남긴다 */}
      <button
        type="button"
        aria-label="안내 닫기"
        onClick={() => finish("skip")}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(11,20,40,.55)]"
      />
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[14px] ring-2 ring-white/90"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(11,20,40,.55)",
          }}
        />
      )}

      <div
        className="absolute w-[280px] rounded-[16px] bg-surface p-4 shadow-[0_18px_44px_rgba(16,28,54,.28)]"
        style={
          centered
            ? { top: "50%", left: "50%", transform: "translate(-50%,-50%)" }
            : { top: bubbleTop, left: bubbleLeft }
        }
      >
        <div className="mb-1 text-[11px] font-bold text-primary">
          {index + 1} / {visibleSteps.length}
        </div>
        <div className="text-[15px] font-extrabold text-ink">{step.title}</div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-2">{step.body}</p>
        <div className="mt-3.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => finish("skip")}
            className="text-[12px] font-semibold text-text-3 underline-offset-2 hover:underline"
          >
            건너뛰기
          </button>
          <div className="flex items-center gap-1.5">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                className="btn-soft rounded-lg px-3 py-1.5 text-[12px]"
              >
                이전
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="btn-primary rounded-lg px-3.5 py-1.5 text-[12px]"
            >
              {isLast ? "시작하기" : "다음"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CoachmarkTour;
