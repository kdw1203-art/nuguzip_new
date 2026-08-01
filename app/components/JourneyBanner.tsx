"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isLoopStep(saved)) setStep(saved);
      /* 구 키 정리 */
      window.localStorage.removeItem("nz_journey");
    } catch {
      /* ignore */
    }
    setReady(true);
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

  if (!ready) return null;

  if (step === null) {
    return (
      <div className="card flex flex-col gap-2.5 rounded-2xl px-[18px] py-4">
        <div className="text-[13px] font-extrabold text-ink">지금 어디부터 할까요?</div>
        <p className="text-[11px] text-text-3">임장노트 → AI 정리 → 지도 비교 순서가 기본이에요</p>
        <div className="flex gap-1.5">
          {STEP_KEYS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => select(s)}
              className="chip flex-1 border border-line bg-surface py-2 text-[12px] font-bold text-text-1"
            >
              {STEP_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const recs = STEP_RECS[step];
  return (
    <div className="card flex flex-wrap items-center gap-2 rounded-2xl px-[18px] py-3">
      <span className="text-[12px] font-extrabold text-ink">{STEP_LABEL[step]}</span>
      <span className="text-[11px] text-text-3">추천</span>
      {recs.map((r) => (
        <Link
          key={r.href + r.label}
          href={r.href}
          className="chip border border-primary/30 bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary no-underline"
        >
          {r.label}
        </Link>
      ))}
      <button
        type="button"
        onClick={reset}
        className="ml-auto text-[11px] font-semibold text-text-3 underline"
      >
        단계 다시 고르기
      </button>
    </div>
  );
}
