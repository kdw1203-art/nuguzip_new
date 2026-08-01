"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * 해지 요청 — 즉시 해지 API가 없어 고객센터 접수와 동일한 경로로 구조화 요청.
 * 다음 결제일을 DB에 쓰지 않으므로 날짜를 지어내지 않는다.
 */
export function CancelRequestButton({ currentPlan }: { currentPlan: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    const ok = window.confirm(
      "해지 요청을 접수할까요? 영업일 1일 이내 접수 확인을 안내하며, 약관에 따라 처리됩니다. (다음 결제일은 시스템상 미저장이라 안내하지 않습니다.)",
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "결제·환불",
          subject: `구독 해지 요청 (${currentPlan})`,
          message:
            `현재 플랜: ${currentPlan}\n요청: 구독 해지\n경로: /subscription BillingPanel\n\n` +
            "다음 결제 예정일은 시스템에 저장되어 있지 않습니다. 해지·환불은 약관 제8조에 따라 처리해 주세요.",
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "접수에 실패했습니다.");
        return;
      }
      setDone(true);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="text-[12px] font-semibold text-primary">
        해지 요청이 접수됐어요. 알림함·이메일로 접수 확인을 보내 드려요.{" "}
        <Link href="/notifications" className="underline">
          알림 보기
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || currentPlan === "free"}
        className="btn-soft w-fit rounded-[10px] px-3.5 py-2 text-[12px] font-bold disabled:opacity-50"
      >
        {busy ? "접수 중…" : "해지 요청하기"}
      </button>
      {error && <p className="text-[11px] font-semibold text-danger">{error}</p>}
    </div>
  );
}
