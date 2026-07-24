"use client";

/**
 * 문의 상태 액션 — 등록자(중개사)가 받은 문의를 확인/회신함/보관 처리.
 * POST /api/inquiries/[id]/status
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InquiryStatus } from "@/lib/listings/inquiries";

const NEXT_ACTIONS: { status: InquiryStatus; label: string; primary?: boolean }[] = [
  { status: "read", label: "확인" },
  { status: "replied", label: "회신함", primary: true },
  { status: "archived", label: "보관" },
];

export function LeadActions({
  inquiryId,
  status,
}: {
  inquiryId: string;
  status: InquiryStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function set(next: InquiryStatus) {
    if (busy || next === status) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/inquiries/${inquiryId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setError(true);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {NEXT_ACTIONS.filter((a) => a.status !== status).map((a) => (
        <button
          key={a.status}
          type="button"
          onClick={() => void set(a.status)}
          disabled={busy}
          className={`${a.primary ? "btn-primary" : "btn-outline"} btn-sm press disabled:opacity-50`}
        >
          {a.label}
        </button>
      ))}
      {error && <span className="text-[11px] font-bold text-danger">처리 실패</span>}
    </div>
  );
}
