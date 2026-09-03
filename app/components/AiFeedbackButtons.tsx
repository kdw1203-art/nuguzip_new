"use client";

import { useState } from "react";
import { Icon } from "@/app/components/Icon";

/**
 * AI 출력 품질 피드백 — 도움됨/부족함.
 * KPI·퍼널의 AI 실행 수와 분리해 `ai_feedback` 이벤트로만 쌓는다.
 */
export function AiFeedbackButtons({
  targetType,
  targetId,
  context,
}: {
  targetType: string;
  targetId?: string | null;
  context?: Record<string, unknown>;
}) {
  const [choice, setChoice] = useState<"up" | "down" | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (rating: "up" | "down") => {
    if (busy || choice) return;
    setBusy(true);
    setChoice(rating);
    try {
      await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId: targetId ?? null,
          rating,
          context: context ?? {},
        }),
      });
    } catch {
      /* 피드백 실패해도 UI는 선택 유지 — 다시 누르지 않음 */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-3">
      <span>이 정리가 도움이 됐나요?</span>
      <button
        type="button"
        disabled={busy || choice !== null}
        onClick={() => void send("up")}
        aria-pressed={choice === "up"}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-bold transition ${
          choice === "up"
            ? "border-primary bg-primary-soft text-primary"
            : "border-line bg-surface text-text-2 hover:border-primary/40"
        }`}
      >
        <Icon name="thumbs-up" size={12} />
        도움됨
      </button>
      <button
        type="button"
        disabled={busy || choice !== null}
        onClick={() => void send("down")}
        aria-pressed={choice === "down"}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-bold transition ${
          choice === "down"
            ? "border-danger/40 bg-danger-soft text-danger"
            : "border-line bg-surface text-text-2 hover:border-danger/30"
        }`}
      >
        <Icon name="thumbs-down" size={12} />
        부족함
      </button>
      {choice && (
        <span className="text-text-3">반영했어요 · 실행 수 KPI와는 따로 집계해요</span>
      )}
    </div>
  );
}
