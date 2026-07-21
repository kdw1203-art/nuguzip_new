"use client";

import { useState } from "react";

/**
 * 복사 버튼 (마이 · 친구 추천).
 * variant="code" → 큰 코드 박스, variant="link" → 링크 필드.
 */
export function CopyLink({
  value,
  variant = "link",
}: {
  value: string;
  variant?: "code" | "link";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // 폴백: 임시 textarea
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 클립보드 접근 실패 시 무시 */
    }
  }

  if (variant === "code") {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="select-all font-mono text-[34px] font-extrabold tracking-[0.18em] text-text-1">
          {value}
        </div>
        <button
          type="button"
          onClick={copy}
          className="btn-primary press rounded-[12px] px-6 py-2.5 text-sm"
        >
          {copied ? "복사됨!" : "코드 복사"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 truncate rounded-[12px] bg-surface px-3.5 py-3 text-[13px] text-text-2">
        {value}
      </div>
      <button
        type="button"
        onClick={copy}
        className="btn-primary press shrink-0 rounded-[12px] px-4 py-3 text-sm"
      >
        {copied ? "복사됨!" : "링크 복사"}
      </button>
    </div>
  );
}

export default CopyLink;
