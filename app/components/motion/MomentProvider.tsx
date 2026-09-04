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
 *     `showMoment()` 직후 `router.push()` 해도 오버레이는 안 끊긴다.
 *  3. **소리 없이 사라지지 않는다.** 시각 요소는 `aria-hidden` 이고, 대신
 *     같은 문장을 `role="status"` 로 한 번 읽어 준다.
 *
 * [961] 브랜드 모션 적용(인터랙션 라이브러리 03·05) — 흰 카드에 파랑 링·체크를
 * 그리던 것을 **네이비 면 위에 온점 심볼이 도장처럼 찍히는** 장면으로 바꿨다.
 * 제목 → 부제 → 세리프 슬로건("오래 머물 집을, 지금.") 순서로 떠오른다.
 *  · success  : 도장만. 저장·접수·로그인.
 *  · welcome  : 도장 + "다시 오셨네요" 톤 — 로그인 환영(제목은 호출자가 준다).
 *  · celebrate: 도장 + 파문 두 겹 + 절제된 조각 22개 + 한지 알약(멤버십 시작 등).
 *    폭죽이 아니라 도장인 이유 — 인생 최대 지출을 다루는 서비스에서 요란한 컨페티는
 *    가볍게 읽힌다. "축하"보다 "약속"에 가까운 감각.
 * 모션 자체는 globals.css 의 `.moment-*` 에 있고 reduced-motion 에서는 결과만 즉시 보인다.
 */

export type MomentKind = "success" | "celebrate" | "welcome";

export type MomentInput = {
  title: string;
  subtitle?: string;
  kind?: MomentKind;
  /** celebrate 에서 도장 아래 한지 알약 한 줄(예: "멤버십 시작하기") — 장식용 텍스트, 버튼 아님 */
  pill?: string;
};

type MomentContextValue = { showMoment: (input: MomentInput) => void };

type MomentState = MomentInput & { id: number; leaving: boolean };

/** 장면이 머무는 시간 — 도장(0.8s) + 글 세 줄(1.2s 까지) 뒤 잠깐의 여운 */
const HOLD_MS = 1700;
const HOLD_CELEBRATE_MS = 2300;
/** 사라지는 시간 */
const LEAVE_MS = 300;

const MomentContext = createContext<MomentContextValue | null>(null);

/** Provider 밖에서 불려도 안전하게 아무 일도 하지 않는다. */
export function useMoment(): MomentContextValue {
  const ctx = useContext(MomentContext);
  return ctx ?? { showMoment: () => {} };
}

/* 조각 22개 — 위치는 결정적(난수 없음: SSR/CSR 불일치·재렌더 흔들림 방지).
   각도는 황금각으로 돌리고 거리는 60~170px 사이를 오간다. 색은 한지·주홍·회청·주홍. */
const CONFETTI_COLORS = ["#E0563A", "#F6F1E7", "#8FA6C9", "#C8442B"] as const;
const CONFETTI = Array.from({ length: 22 }, (_, i) => {
  const a = i * 2.399963; // 황금각(rad)
  const d = 60 + ((i * 37) % 110);
  return {
    dx: Math.round(Math.cos(a) * d),
    dy: Math.round(Math.sin(a) * d - 20),
    rot: ((i * 97) % 540) - 270,
    delay: (i % 5) * 50,
    color: CONFETTI_COLORS[i % 4],
  };
});

function MomentScene({ moment }: { moment: MomentState }) {
  const kind = moment.kind ?? "success";
  return (
    <div className="moment-layer" data-leaving={moment.leaving ? "true" : "false"}>
      <div className="moment-card" data-kind={kind} aria-hidden="true">
        {kind === "celebrate" && (
          <>
            <span className="moment-ripple" />
            <span className="moment-ripple" />
            {CONFETTI.map((c, i) => (
              <span
                key={i}
                className="moment-conf"
                style={
                  {
                    background: c.color,
                    "--dx": `${c.dx}px`,
                    "--dy": `${c.dy}px`,
                    "--rot": `${c.rot}deg`,
                    animationDelay: `${c.delay}ms`,
                  } as React.CSSProperties
                }
              />
            ))}
          </>
        )}
        {/* 온점 심볼(반전형) — 브랜드 마스터 v2.1 규정: 한지 획 + 주홍 온점 E0563A */}
        <svg className="moment-seal" width="66" height="61" viewBox="0 0 120 120">
          <path d="M52 28 L68 28" fill="none" stroke="#F6F1E7" strokeWidth="7" strokeLinecap="round" />
          <path
            d="M14 46 C 38 64, 82 64, 106 46"
            fill="none"
            stroke="#F6F1E7"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <circle cx="60" cy="86" r="8.5" fill="#E0563A" />
        </svg>
        <div className="moment-title t-section text-center">{moment.title}</div>
        {moment.subtitle && (
          <div className="moment-sub max-w-[240px] text-center t-sub leading-[1.7]">
            {moment.subtitle}
          </div>
        )}
        <div className="moment-slogan">
          오래 머물 집을, 지금<i>.</i>
        </div>
        {kind === "celebrate" && moment.pill && <div className="moment-pill">{moment.pill}</div>}
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
      const hold = input.kind === "celebrate" ? HOLD_CELEBRATE_MS : HOLD_MS;

      timers.current.push(
        window.setTimeout(() => {
          setMoment((prev) => (prev ? { ...prev, leaving: true } : prev));
        }, hold),
      );
      timers.current.push(window.setTimeout(() => setMoment(null), hold + LEAVE_MS));
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
