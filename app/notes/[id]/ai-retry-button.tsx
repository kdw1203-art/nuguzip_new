"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../../components/toast/ToastProvider";

/** 소유자용 — 저장 직후 AI 실패·규칙 폴백만 있을 때 재분석 */
export function AiRetryButton({ noteId }: { noteId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/inspection/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId, force: true }),
      });
      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(`/notes/${noteId}`)}`);
        return;
      }
      if (!res.ok) {
        showToast("AI 정리를 다시 시도하지 못했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      showToast("AI 정리를 다시 실행했어요");
      router.refresh();
    } catch {
      showToast("네트워크 오류로 재분석을 못 했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="press mt-2 inline-flex w-fit items-center rounded-lg bg-white/10 px-3 py-2 text-[12px] font-extrabold text-ai-accent disabled:opacity-60"
    >
      {busy ? "AI 정리 중…" : "AI 다시 정리하기"}
    </button>
  );
}
