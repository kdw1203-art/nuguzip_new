"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 결제 취소(전액 환불) 버튼 — paid 건에만 렌더된다.
 * 2단 확인(버튼 자리에서) 후 /api/admin/payments/cancel 호출.
 * 성공 시 router.refresh 로 표를 다시 그린다(낙관적 갱신 없음 — 장부는
 * 서버가 확정한 상태만 보여준다).
 */
export function CancelPaymentButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reason: "고객 요청 환불(관리자 처리)" }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        warning?: string;
      };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "취소에 실패했어요.");
        return;
      }
      if (j.warning) setError(j.warning);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      {confirming ? (
        <span className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-line px-2 py-1 text-[11px] font-bold text-text-2"
          >
            아니오
          </button>
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="rounded-lg bg-danger-soft px-2 py-1 text-[11px] font-extrabold text-danger disabled:opacity-50"
          >
            {busy ? "취소 중…" : "전액 환불 확정"}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-line px-2 py-1 text-[11px] font-bold text-text-3 hover:text-danger"
        >
          취소
        </button>
      )}
      {error && (
        <span role="alert" className="max-w-[220px] text-right text-[10px] font-bold text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
