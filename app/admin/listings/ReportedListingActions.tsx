"use client";

/* 신고 누적 매물 숨김 해제 / 수동 숨김 — PATCH /api/admin/listings (I8)
   자동 숨김은 사람 판단 없이 걸리므로, 사람이 되돌릴 수 있는 버튼이 반드시 있어야 한다. */

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReportedListingActions({
  id,
  hidden,
}: {
  id: string;
  hidden: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"hidden" | "unhidden" | null>(null);

  async function act(action: "unhide" | "hide") {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/listings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "처리에 실패했어요.");
        return;
      }
      setDone(action === "hide" ? "hidden" : "unhidden");
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="text-[12px] font-extrabold text-ai-success">
        {done === "hidden" ? "숨김 처리 완료" : "숨김 해제 완료 — 신고 수를 0으로 되돌렸어요."}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hidden ? (
        <button
          type="button"
          onClick={() => act("unhide")}
          disabled={busy}
          className="rounded-lg bg-ai-success px-3.5 py-1.5 text-[12px] font-extrabold text-[#0c2a17] disabled:opacity-50"
        >
          숨김 해제
        </button>
      ) : (
        <button
          type="button"
          onClick={() => act("hide")}
          disabled={busy}
          className="rounded-lg bg-danger-fill px-3.5 py-1.5 text-[12px] font-extrabold text-white disabled:opacity-50"
        >
          숨김 처리
        </button>
      )}
      <span className="text-[10px] text-[#6b7688]">
        {hidden
          ? "해제하면 즉시 목록에 다시 노출되고, 누적 신고 수는 0으로 초기화돼요."
          : "신고 내용을 확인한 뒤 필요하면 직접 숨길 수 있어요."}
      </span>
      {error && <span className="text-[12px] font-bold text-[#f2c94c]">{error}</span>}
    </div>
  );
}
