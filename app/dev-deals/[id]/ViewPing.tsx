"use client";

import { useEffect } from "react";

/** 조회수 핑 — 마운트 시 1회. ISR 페이지라 서버 렌더에서 세지 못하는 것을
 *  클라이언트에서 대신 센다. 실패는 조용히 무시(조회수는 best-effort). */
export function ViewPing({ dealId }: { dealId: string }) {
  useEffect(() => {
    const url = `/api/dev-deals/deal/${encodeURIComponent(dealId)}/view`;
    try {
      if (navigator.sendBeacon?.(url)) return;
    } catch {
      /* sendBeacon 미지원/차단 → fetch 폴백 */
    }
    fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  }, [dealId]);
  return null;
}

export default ViewPing;
