"use client";

import { useEffect, useState, type ReactNode } from "react";
import { isAdFreePlan } from "@/lib/ads/ad-free";

/**
 * 정적 캐시 페이지(홈·동네 피드 등 `revalidate` 사용)용 광고 게이트.
 *
 * 이런 페이지는 서버에서 세션을 읽으면 캐시가 통째로 죽는다(#21 스케일 지침).
 * 대신 캐시된 HTML 은 광고를 포함한 채 내려보내고, 하이드레이션 후 세션의
 * plan 이 광고 제거 플랜이면 클라이언트에서 숨긴다. 유료 사용자에게 첫 페인트에
 * 광고가 잠깐 보일 수 있지만, 캐시를 포기하는 것보다 낫다 — 동적 페이지는
 * 서버에서 adFree 를 계산해 이 게이트를 거치지 않는다(lib/ads/viewer.ts).
 */
export function AdFreeGate({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((j: { user?: { plan?: string } } | null) => {
        if (!cancelled && isAdFreePlan(j?.user?.plan)) setHidden(true);
      })
      .catch(() => {
        /* 세션 확인 실패 시 광고 유지 (비로그인과 동일 취급) */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (hidden) return null;
  return <>{children}</>;
}

export default AdFreeGate;
