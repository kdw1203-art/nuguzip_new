"use client";

import { ShareLinkButton } from "@/app/components/ShareLinkButton";

/* 모임 공유 — [966] 공용 ShareLinkButton 의 얇은 래퍼(시트→클립보드→토스트는 거기서).
   이 파일이 남은 이유: 모임 상세 page.tsx 의 임포트를 건드리지 않기 위해서다. */

export function ShareButton({ title }: { title: string }) {
  return (
    <ShareLinkButton
      title={title}
      text={`${title} · 임장 모임`}
      label="공유"
      copiedLabel="링크 복사됨 ✓"
      variant="text"
      className="btn-secondary flex-1 rounded-xl p-3 text-center text-[13px]"
    />
  );
}
