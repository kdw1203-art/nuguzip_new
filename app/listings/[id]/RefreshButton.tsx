"use client";

/**
 * #6 끌어올리기(갱신) 버튼 — 소유자에게만 노출.
 * POST /api/listings/[id]/refresh → refreshed_at=now. 성공 시 페이지 새로고침으로
 * "확인 필요" 배지가 사라진다.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefreshButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function onClick() {
    setPhase("busy");
    try {
      const res = await fetch(`/api/listings/${listingId}/refresh`, {
        method: "POST",
      });
      if (res.status === 401) {
        router.push(`/login?callbackUrl=/listings/${listingId}`);
        return;
      }
      if (!res.ok) {
        setPhase("error");
        return;
      }
      setPhase("done");
      router.refresh();
    } catch {
      setPhase("error");
    }
  }

  if (phase === "done") {
    return (
      <span className="text-[12px] font-bold text-[#1a7f4e]">끌어올렸어요 ✓</span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={phase === "busy"}
        className="btn-primary btn-sm press disabled:opacity-50"
      >
        {phase === "busy" ? "갱신 중…" : "끌어올리기(갱신)"}
      </button>
      {phase === "error" && (
        <span className="text-[11px] font-bold text-danger">
          갱신 실패 — 잠시 후 다시 시도해 주세요
        </span>
      )}
    </div>
  );
}
