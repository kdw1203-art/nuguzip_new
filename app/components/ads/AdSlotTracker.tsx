"use client";

import type { ReactNode } from "react";

/**
 * 광고 클릭만 집계한다.
 *
 * 노출(impression)은 일부러 안 센다. 홈은 5분 캐시 + 서버 렌더라 렌더될 때마다
 * 이벤트를 쏘면 실제로 사람이 봤는지와 무관한 숫자가 쌓인다. 클릭은 사람이
 * 직접 누른 것이라 그 자체로 사실이다. 노출 대비 클릭률이 필요해지면
 * IntersectionObserver 기반 뷰어빌리티로 따로 만들어야 한다.
 */
export function AdSlotTracker({
  creativeId,
  kind,
  children,
}: {
  creativeId: string;
  kind: "banner" | "house";
  children: ReactNode;
}) {
  const onClick = () => {
    try {
      void fetch("/api/platform/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: kind === "house" ? "house_ad_click" : "banner_click",
          source: "client",
          campaign: "ads",
          path: typeof window !== "undefined" ? window.location.pathname : undefined,
          metadata: { creativeId, kind },
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // 계측 실패가 링크 이동을 막지 않는다
    }
  };

  return (
    <div onClick={onClick} className="contents">
      {children}
    </div>
  );
}

export default AdSlotTracker;
