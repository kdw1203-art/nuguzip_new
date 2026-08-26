"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getHomePersonal } from "@/lib/client/home-personal";
import { HOME_CTA_AI, HOME_CTA_MAP, HOME_CTA_NOTE } from "@/lib/brand/home-copy";

/**
 * 여정 배너 — PersonalHome과 같은 노트→AI→지도 루프만 안내.
 * (옛 browsing/field/closing localStorage 단계는 제거 — 이중 퍼널 해소)
 */

type LoopStep = "note" | "ai" | "map";

const STORAGE_KEY = "nz_journey_loop";

const STEP_LABEL: Record<LoopStep, string> = {
  note: "1. 기록",
  ai: "2. AI",
  map: "3. 지도",
};

/** 단계 카드 보조 문구 — 제품이 실제로 하는 일만 적는다 */
const STEP_DESC: Record<LoopStep, string> = {
  note: "현장에서 3분 기록",
  ai: "장단점 자동 정리",
  map: "실거래가와 비교",
};

function StepIcon({ step, className }: { step: LoopStep; className?: string }) {
  const common = {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  if (step === "note") {
    return (
      <svg {...common}>
        <path d="M4 16.5V5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 16 5v11.5l-4.5-2.3L7 16.5" />
        <path d="M7.5 7h5M7.5 10h3" />
      </svg>
    );
  }
  if (step === "ai") {
    return (
      <svg {...common}>
        <path d="M10 3.5 11.3 7.6 15.5 9 11.3 10.4 10 14.5 8.7 10.4 4.5 9 8.7 7.6 10 3.5Z" />
        <path d="M15.5 13.5v3M14 15h3" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M10 17c-3.4-3.7-5-6.2-5-8.6C5 5.4 7.2 3.5 10 3.5s5 1.9 5 4.9c0 2.4-1.6 4.9-5 8.6Z" />
      <circle cx="10" cy="8.6" r="1.7" />
    </svg>
  );
}

const STEP_RECS: Record<LoopStep, { label: string; href: string }[]> = {
  note: [
    { label: HOME_CTA_NOTE.label, href: HOME_CTA_NOTE.href },
    { label: "공개 임장노트", href: "/notes" },
  ],
  ai: [
    { label: HOME_CTA_AI.label, href: HOME_CTA_AI.href },
    { label: HOME_CTA_NOTE.label, href: HOME_CTA_NOTE.href },
  ],
  map: [
    { label: HOME_CTA_MAP.label, href: HOME_CTA_MAP.href },
    { label: HOME_CTA_NOTE.label, href: HOME_CTA_NOTE.href },
  ],
};

const STEP_KEYS: LoopStep[] = ["note", "ai", "map"];

function isLoopStep(v: string | null): v is LoopStep {
  return v === "note" || v === "ai" || v === "map";
}

export function JourneyBanner() {
  const [step, setStep] = useState<LoopStep | null>(null);
  const [ready, setReady] = useState(false);
  /** 로그인 PersonalHome 이 켜지면 이중 여정 배너를 숨긴다 */
  const [personalActive, setPersonalActive] = useState(false);
  /* 이미 노트를 써 본 사람에게는 안 그린다. (A05)
     "기록 → AI → 지도" 는 홈의 주 버튼(임장노트 쓰기)이 이미 시작하는 흐름이라,
     아는 사람에게는 같은 말을 두 번 하는 셈이었다 — 홈에 CTA 가 넷이던 원인 중 하나.
     null 은 "아직 모름"이고 false 가 되어야 그린다(모르는 동안 깜빡이지 않게). */
  const [isNewcomer, setIsNewcomer] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isLoopStep(saved)) setStep(saved);
      /* welcome 루프 키 → 배너 단계로 흡수 후 제거 (쓰기만 하던 dead key 해소) */
      const onboarding = window.localStorage.getItem("nz_onboarding_loop");
      if (!isLoopStep(saved) && onboarding === "note") {
        setStep("note");
        window.localStorage.setItem(STORAGE_KEY, "note");
      } else if (!isLoopStep(saved) && onboarding === "done") {
        setStep("map");
        window.localStorage.setItem(STORAGE_KEY, "map");
      }
      if (onboarding) window.localStorage.removeItem("nz_onboarding_loop");
      window.localStorage.removeItem("nz_journey");
    } catch {
      /* ignore */
    }
    /* 노트가 하나라도 있으면 신규가 아니다. 비로그인·조회 실패는 신규로 본다 —
       처음 온 사람에게 안내를 빠뜨리는 쪽이 더 나쁜 실수다. */
    getHomePersonal<{ recentNote: unknown | null }>()
      .then((p) => setIsNewcomer(!p || !p.recentNote))
      .catch(() => setIsNewcomer(true));

    const readPersonal = () => {
      setPersonalActive(document.body.getAttribute("data-personal-active") === "1");
    };
    readPersonal();
    const obs = new MutationObserver(readPersonal);
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-personal-active"],
    });
    setReady(true);
    return () => obs.disconnect();
  }, []);

  const select = (s: LoopStep) => {
    setStep(s);
    try {
      window.localStorage.setItem(STORAGE_KEY, s);
    } catch {
      /* ignore */
    }
  };

  const reset = () => {
    setStep(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  if (!ready || personalActive) return null;
  /* 신규 여부를 아직 모르면 그리지 않는다 — 떴다 사라지는 배너가 더 어수선하다. */
  if (isNewcomer !== true) return null;

  if (step === null) {
    return (
      <div className="card flex flex-col gap-3 rounded-2xl px-[18px] py-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[13px] font-extrabold text-ink">지금 어디부터 할까요?</div>
          <p className="hidden text-[11px] text-text-3 sm:block">
            임장(臨場) = 현장에서 직접 확인 — 기록 → AI 정리 → 지도 비교 순서
          </p>
        </div>
        <div className="flex items-stretch gap-0">
          {STEP_KEYS.map((s, i) => (
            <div key={s} className="flex min-w-0 flex-1 items-center">
              <button
                type="button"
                onClick={() => select(s)}
                className="group flex w-full min-w-0 flex-col items-start gap-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(29,79,216,.45)] hover:shadow-[0_10px_22px_rgba(16,28,54,.08)]"
              >
                <span className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft t-caption font-extrabold text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                    {i + 1}
                  </span>
                  <StepIcon
                    step={s}
                    className="h-4 w-4 text-text-3 transition-all duration-200 group-hover:scale-110 group-hover:text-primary"
                  />
                  <span className="t-body font-extrabold text-text-1 group-hover:text-primary">
                    {STEP_LABEL[s].split(". ")[1]}
                  </span>
                </span>
                <span className="truncate t-caption text-text-3">{STEP_DESC[s]}</span>
              </button>
              {i < STEP_KEYS.length - 1 && (
                <span aria-hidden className="shrink-0 px-1 text-[11px] text-text-3">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const recs = STEP_RECS[step];
  const activeIdx = STEP_KEYS.indexOf(step);
  return (
    <div className="card flex flex-col gap-2.5 rounded-2xl px-[18px] py-3">
      {/* 진행 레일 — 선택한 단계까지 채워진다 */}
      <div className="flex items-center gap-2">
        {STEP_KEYS.map((s, i) => (
          <div key={s} className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => select(s)}
              aria-current={s === step ? "step" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-extrabold transition-all duration-200 ${
                s === step
                  ? "bg-primary text-white shadow-[0_4px_12px_rgba(29,79,216,.3)]"
                  : i < activeIdx
                    ? "bg-primary-soft text-primary"
                    : "bg-[rgba(0,0,0,.04)] text-text-3 hover:text-text-1"
              }`}
            >
              <StepIcon step={s} className="h-3.5 w-3.5" />
              {STEP_LABEL[s].split(". ")[1]}
            </button>
            {i < STEP_KEYS.length - 1 && (
              <span className="relative h-[3px] min-w-3 flex-1 overflow-hidden rounded-full bg-[rgba(0,0,0,.06)]">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500"
                  style={{ width: i < activeIdx ? "100%" : "0%" }}
                />
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-text-3">
          {STEP_DESC[step]} — 추천
        </span>
        {recs.map((r) => (
          <Link
            key={r.href + r.label}
            href={r.href}
            className="group chip border border-primary/30 bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary no-underline transition-all duration-150 hover:-translate-y-px hover:shadow-[0_6px_14px_rgba(29,79,216,.18)]"
          >
            {r.label}
            <span aria-hidden className="ml-0.5 inline-block transition-transform duration-150 group-hover:translate-x-0.5">
              ›
            </span>
          </Link>
        ))}
        <button
          type="button"
          onClick={reset}
          className="ml-auto text-[11px] font-semibold text-text-3 underline transition-colors hover:text-text-1"
        >
          단계 다시 고르기
        </button>
      </div>
    </div>
  );
}
