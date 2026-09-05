"use client";

import { useCopy } from "@/lib/ui/use-copy";

/**
 * 복사 버튼 (마이 · 친구 추천).
 * variant="code" → 큰 코드 박스, variant="link" → 링크 필드.
 * [966] 클립보드·폴백·토스트는 useCopy 로 — 버튼 라벨("복사됨!")은 그대로.
 */
export function CopyLink({
  value,
  variant = "link",
}: {
  value: string;
  variant?: "code" | "link";
}) {
  const { copy, copied } = useCopy(variant === "code" ? "코드를 복사했어요" : "링크를 복사했어요");

  if (variant === "code") {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="select-all font-mono t-title tracking-[0.18em] text-text-1">
          {value}
        </div>
        <button
          type="button"
          onClick={() => void copy(value)}
          className="btn-primary press rounded-[10px] px-6 py-2.5 text-[13px]"
        >
          {copied ? "복사됨!" : "코드 복사"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 truncate rounded-[10px] bg-surface px-3.5 py-3 t-body text-text-2">
        {value}
      </div>
      <button
        type="button"
        onClick={() => void copy(value)}
        className="btn-primary press shrink-0 rounded-[10px] px-4 py-3 text-[13px]"
      >
        {copied ? "복사됨!" : "링크 복사"}
      </button>
    </div>
  );
}

export default CopyLink;
