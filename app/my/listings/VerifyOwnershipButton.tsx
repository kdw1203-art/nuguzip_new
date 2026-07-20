"use client";

/* 소유확인 신청 — 증빙 이미지를 /api/upload(folder="listing-verify")로 올린 뒤
   POST /api/listings/[id]/verify 로 신청. 실제 인증 배지는 어드민 검토 후 표시된다. */

import { useRef, useState } from "react";

type Phase = "idle" | "uploading" | "submitting" | "done" | "error";

export function VerifyOwnershipButton({ listingId }: { listingId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    setMsg(null);
    setPhase("uploading");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "listing-verify");
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const upData = (await up.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!up.ok || !upData.url) {
        setPhase("error");
        setMsg(upData.error ?? "증빙 업로드에 실패했어요. 다시 시도해 주세요.");
        return;
      }
      setPhase("submitting");
      const res = await fetch(`/api/listings/${listingId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofUrl: upData.url }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setPhase("error");
        setMsg(data.error ?? "소유확인 신청에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setPhase("done");
      setMsg("신청 접수 · 검토 후 인증 배지가 표시돼요");
    } catch {
      setPhase("error");
      setMsg("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  if (phase === "done") {
    return (
      <span className="rounded-[8px] bg-[rgba(26,127,78,.1)] px-3 py-1.5 text-[12px] font-extrabold text-[#1a7f4e]">
        소유확인 신청 접수됨
      </span>
    );
  }

  const busy = phase === "uploading" || phase === "submitting";
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="btn-outline btn-sm"
      >
        {phase === "uploading"
          ? "증빙 업로드 중…"
          : phase === "submitting"
            ? "신청 중…"
            : "소유확인 신청"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
      {msg && (
        <span
          className={`text-[11px] font-bold ${
            phase === "error" ? "text-[#d64545]" : "text-[#1a7f4e]"
          }`}
        >
          {msg}
        </span>
      )}
    </div>
  );
}
