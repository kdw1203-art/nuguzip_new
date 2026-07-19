"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/* 제언-기획 #19 여정 단계 분기 배너 — 첫 방문 시 단계 선택, 이후 단계별 추천 행 1줄로 축소.
   선택값은 localStorage("nz_journey")에 보존. */

type Stage = "browsing" | "field" | "closing";

const STORAGE_KEY = "nz_journey";

const STAGE_LABEL: Record<Stage, string> = {
  browsing: "구경 중",
  field: "실전 임장",
  closing: "계약 직전",
};

const STAGE_RECS: Record<Stage, { label: string; href: string }[]> = {
  browsing: [
    { label: "발견 피드", href: "/discover" },
    { label: "샘플 노트", href: "/notes" },
  ],
  field: [
    { label: "다자 비교", href: "/analysis/compare" },
    { label: "대출 계산기", href: "/calculator" },
  ],
  closing: [
    { label: "전세 안전 진단", href: "/safety" },
    { label: "계약 타임라인", href: "/analysis" },
  ],
};

const STAGE_KEYS: Stage[] = ["browsing", "field", "closing"];

function isStage(v: string | null): v is Stage {
  return v === "browsing" || v === "field" || v === "closing";
}

export function JourneyBanner() {
  const [stage, setStage] = useState<Stage | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isStage(saved)) setStage(saved);
    } catch {
      // localStorage 접근 불가 시 무시 (매 방문 질문 상태 유지)
    }
    setReady(true);
  }, []);

  const select = (s: Stage) => {
    setStage(s);
    try {
      window.localStorage.setItem(STORAGE_KEY, s);
    } catch {
      // 저장 실패는 무시
    }
  };

  const reset = () => {
    setStage(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 삭제 실패는 무시
    }
  };

  // SSR·하이드레이션 동안은 렌더하지 않음 (localStorage 값과 불일치 방지)
  if (!ready) return null;

  if (stage === null) {
    return (
      <div className="card flex flex-col gap-2.5 rounded-2xl px-[18px] py-4">
        <div className="text-[13px] font-extrabold text-ink">지금 어느 단계세요?</div>
        <div className="flex gap-1.5">
          {STAGE_KEYS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => select(s)}
              className="chip flex-1 border border-line bg-surface px-3 py-2 text-xs text-text-1 transition-colors hover:bg-bg"
            >
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card flex items-center gap-2 rounded-2xl px-[18px] py-3">
      <span className="chip chip-soft shrink-0 px-2.5 py-1 text-[11px]">
        {STAGE_LABEL[stage]}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {STAGE_RECS[stage].map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="chip shrink-0 border border-line bg-surface px-3 py-1.5 text-xs font-bold text-text-1"
          >
            {r.label} ›
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={reset}
        className="shrink-0 text-[11px] text-text-3"
      >
        변경
      </button>
    </div>
  );
}
