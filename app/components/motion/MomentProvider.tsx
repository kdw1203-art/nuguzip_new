"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

/**
 * "됐다" 순간을 1.5초짜리 짧은 장면으로 보여 주는 오버레이.
 *
 * 저장·로그인·신청처럼 **결과가 중요한 순간**에만 쓴다. 토스트(useToast)는
 * "알아 두세요" 용이고, 이쪽은 "성사됐습니다" 용이다. 아무 데나 붙이면
 * 화면을 가리는 장식일 뿐이라, 부르는 곳을 일부러 적게 유지한다.
 *
 * 설계상 지킨 것 세 가지:
 *
 *  1. **조작을 막지 않는다.** 레이어는 `pointer-events: none` 이라 오버레이가
 *     떠 있는 동안에도 버튼이 눌린다. 축하 연출이 사용자를 1.5초 묶어 두면
 *     그건 축하가 아니라 지연이다.
 *  2. **화면이 바뀌어도 이어진다.** Provider 가 루트 레이아웃에 있으므로
 *     `showMoment()` 직후 `router.push()` 해도 오버레이는 안 끊긴다. 오히려
 *     그 편이 자연스럽다 — 연출이 이동을 덮어 준다.
 *  3. **소리 없이 사라지지 않는다.** 시각 요소는 `aria-hidden` 이고, 대신
 *     같은 문장을 `role="status"` 로 한 번 읽어 준다. 모션을 못 보는 사람도
 *     결과는 알아야 한다.
 *
 * 모션 자체(링 그리기 → 체크 → 잔물결)는 globals.css 의 `.moment-*` 에 있다.
 * 영상 파일이 아니라 SVG 획을 그리는 방식이라 추가 다운로드가 없고,
 * `prefers-reduced-motion` 에서는 그려진 결과만 즉시 보여 준다.
 */

/** 색만 다르다. 형태를 종류마다 바꾸면 "무슨 뜻이지"를 매번 새로 배워야 한다. */
export type MomentKind = "success" | "celebrate";

export type MomentInput = {
  title: string;
  subtitle?: string;
  kind?: MomentKind;
};

type MomentContextValue = { showMoment: (input: MomentInput) => void };

type MomentState = MomentInput & { id: number; leaving: boolean };

/** 장면이 머무는 시간 */
const HOLD_MS = 1350;
/** 사라지는 시간 */
const LEAVE_MS = 300;

const MomentContext = createContext<MomentContextValue | null>(null);

/** Provider 밖에서 불려도 안전하게 아무 일도 하지 않는다. */
export function useMoment(): MomentContextValue {
  const ctx = useContext(MomentContext);
  return ctx ?? { showMoment: () => {} };
}

const ACCENT: Record<MomentKind, string> = {
  success: "var(--primary)",
  celebrate: "var(--success)",
};

function MomentScene({ moment }: { moment: MomentState }) {
  const accent = ACCENT[moment.kind ?? "success"];

  return (
    <div
      className="moment-layer"
      data-leaving={moment.leaving ? "true" : "false"}
    >
      <div className="moment-card">
        <svg
          viewBox="0 0 72 72"
          width="72"
          height="72"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="moment-halo"
            cx="36"
            cy="36"
            r="30"
            stroke={accent}
            strokeWidth="2"
          />
          <circle
            className="moment-ring"
            cx="36"
            cy="36"
            r="30"
            stroke={accent}
            strokeWidth="4"
            strokeLinecap="round"
            transform="rotate(-90 36 36)"
          />
          <path
            className="moment-check"
            d="M23 37.5 L32.5 47 L50 27"
            stroke={accent}
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="moment-title text-[15px] font-extrabold text-ink">
          {moment.title}
        </div>
        {moment.subtitle && (
          <div className="moment-sub max-w-[240px] text-center text-[12px] leading-[1.7] text-text-2">
            {moment.subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

export function MomentProvider({ children }: { children: ReactNode }) {
  const [moment, setMoment] = useState<MomentState | null>(null);
  const timers = useRef<number[]>([]);
  const idRef = useRef(0);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const showMoment = useCallback(
    (input: MomentInput) => {
      const title = input.title?.trim();
      if (!title) return;
      clearTimers();
      idRef.current += 1;
      setMoment({ ...input, title, id: idRef.current, leaving: false });

      timers.current.push(
        window.setTimeout(() => {
          setMoment((prev) => (prev ? { ...prev, leaving: true } : prev));
        }, HOLD_MS),
      );
      timers.current.push(
        window.setTimeout(() => setMoment(null), HOLD_MS + LEAVE_MS),
      );
    },
    [clearTimers],
  );

  return (
    <MomentContext.Provider value={{ showMoment }}>
      {children}
      {/* 모션을 못 보거나 안 보는 경우를 위해 같은 내용을 한 번 읽어 준다 */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {moment ? [moment.title, moment.subtitle].filter(Boolean).join(" ") : ""}
      </div>
      {moment && <MomentScene key={moment.id} moment={moment} />}
    </MomentContext.Provider>
  );
}

export default MomentProvider;
