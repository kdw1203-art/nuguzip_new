"use client";

/* I5 매물 부스트 셀프서비스(포인트 500P·7일) — POST /api/listings/[id]/boost.
   오클릭 방지 2단계 확인. 성공 시 페이지 새로고침으로 부스트 배지 갱신. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/components/toast/ToastProvider";

export function BoostButton({ listingId, active }: { listingId: string; active: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [phase, setPhase] = useState<"idle" | "confirm" | "busy">("idle");

  async function run() {
    setPhase("busy");
    try {
      const res = await fetch(`/api/listings/${listingId}/boost`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        showToast(json.error ?? "부스트에 실패했어요");
        setPhase("idle");
        return;
      }
      showToast(active ? "부스트를 7일 연장했어요" : "7일 상단 노출을 시작했어요");
      router.refresh();
    } catch {
      showToast("네트워크 오류가 발생했어요");
      setPhase("idle");
    }
  }

  if (phase === "confirm") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button type="button" onClick={() => void run()} className="btn-primary btn-sm press">
          500P 사용
        </button>
        <button type="button" onClick={() => setPhase("idle")} className="btn-ghost btn-sm">
          취소
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPhase("confirm")}
      disabled={phase === "busy"}
      className="btn-primary btn-sm press disabled:opacity-50"
    >
      {active ? "부스트 연장 (500P)" : "노출 부스트 (500P·7일)"}
    </button>
  );
}
