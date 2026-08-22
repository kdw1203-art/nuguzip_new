"use client";

import { useState } from "react";
import { Icon } from "@/app/components/Icon";

/* [개선 #32] 범용 공유 버튼 — Web Share API 우선, 미지원 시 클립보드 복사 폴백.
 * (모임 상세의 ShareButton 과 같은 동작을 스타일 주입 가능한 형태로 일반화) */

export function ShareLinkButton({
  title,
  text,
  className = "",
}: {
  title: string;
  text?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title, text: text ?? title, url });
        return;
      }
    } catch {
      return; // 사용자가 공유 취소 — 폴백하지 않음
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
    <button type="button" onClick={() => void share()} className={className}>
      <Icon name="share" size={14} />
      {copied ? "복사됨 ✓" : "공유"}
    </button>
  );
}
