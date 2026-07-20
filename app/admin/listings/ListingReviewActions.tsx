"use client";

/* 매물 검수 승인/반려 버튼 — PATCH /api/admin/listings */

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ListingReviewActions({ id }: { id: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"approved" | "rejected" | null>(null);

  async function act(action: "approve" | "reject") {
    if (action === "reject" && !reason.trim()) {
      setError("반려 사유를 입력해 주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/listings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, reason: reason.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "처리에 실패했어요.");
        return;
      }
      setResult(action === "approve" ? "approved" : "rejected");
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div
        className={`text-[12px] font-extrabold ${
          result === "approved" ? "text-[#4ade80]" : "text-[#d64545]"
        }`}
      >
        {result === "approved" ? "승인 완료 — 목록에 노출됩니다." : "반려 완료"}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => act("approve")}
        disabled={busy}
        className="rounded-lg bg-[#4ade80] px-3.5 py-1.5 text-[12px] font-extrabold text-[#0c2a17] disabled:opacity-50"
      >
        승인
      </button>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="반려 사유 (반려 시 필수)"
        maxLength={500}
        className="min-w-[220px] flex-1 rounded-lg border border-[rgba(255,255,255,.12)] bg-[rgba(255,255,255,.06)] px-3 py-1.5 text-[12px] text-white placeholder:text-[#6b7688]"
      />
      <button
        type="button"
        onClick={() => act("reject")}
        disabled={busy}
        className="rounded-lg bg-[rgba(214,69,69,.85)] px-3.5 py-1.5 text-[12px] font-extrabold text-white disabled:opacity-50"
      >
        반려
      </button>
      {error && <span className="text-[11px] font-bold text-[#f2c94c]">{error}</span>}
    </div>
  );
}
