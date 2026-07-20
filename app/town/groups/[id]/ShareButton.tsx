"use client";

import { useState } from "react";

/* 모임 공유 — Web Share API 우선, 미지원 시 클립보드 복사 폴백 */

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `${title} · 임장 모임`, url });
        return;
      }
    } catch {
      /* 사용자가 공유 취소 — 폴백 시도하지 않음 */
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 클립보드 접근 불가 — 무시 */
    }
  };

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="btn-secondary flex-1 rounded-xl p-3 text-center text-[13px]"
    >
      {copied ? "링크 복사됨 ✓" : "공유"}
    </button>
  );
}
