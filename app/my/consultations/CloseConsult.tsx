"use client";

/* 의뢰자 마감 (953) — 답변 없는 내 상담을 접는다. PATCH { action: "close" } */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/components/toast/ToastProvider";

export function CloseConsult({ expertId, consultationId }: { expertId: string; consultationId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const close = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/experts/${expertId}/consult`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultationId, action: "close" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(data.error ?? "마감하지 못했어요");
        setBusy(false);
        return;
      }
      showToast("상담을 마감했어요");
      router.refresh();
    } catch {
      showToast("네트워크 오류가 발생했어요");
      setBusy(false);
    }
  };

  if (!confirm) {
    return (
      <button type="button" onClick={() => setConfirm(true)} className="btn-ghost btn-sm text-text-3">
        더 기다리지 않을래요
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 t-sub text-text-2">
      상담을 마감할까요?
      <button type="button" onClick={() => void close()} disabled={busy} className="btn-outline btn-sm press disabled:opacity-50">
        {busy ? "마감 중…" : "마감"}
      </button>
      <button type="button" onClick={() => setConfirm(false)} className="btn-ghost btn-sm">
        취소
      </button>
    </span>
  );
}
