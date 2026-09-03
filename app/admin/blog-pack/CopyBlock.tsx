"use client";

import { useState } from "react";
import { INLINE_CONFIRM_MS } from "@/lib/ui/feedback-timing";

/* 복사 가능한 블록 — 관리자 블로그 팩 전용의 작은 클라이언트 조각 */
export function CopyBlock({
  label,
  text,
  rows = 4,
}: {
  label: string;
  text: string;
  rows?: number;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold text-[#c9d2e0]">{label}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), INLINE_CONFIRM_MS);
            } catch {
              /* 클립보드 권한 없음 — 수동 선택 복사로 폴백 (textarea 는 그대로) */
            }
          }}
          className="rounded-lg bg-[#3182f6] px-3 py-1 text-[12px] font-bold text-white"
        >
          {copied ? "복사됨 ✓" : "복사"}
        </button>
      </div>
      <textarea
        readOnly
        value={text}
        rows={rows}
        className="w-full resize-y rounded-xl border border-[rgba(255,255,255,.12)] bg-[#0d1119] p-3 font-mono text-[12px] leading-[1.7] text-[#e7ecf5]"
      />
    </div>
  );
}
