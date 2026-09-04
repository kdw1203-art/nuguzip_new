"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  getAdSenseClient,
  getSlotForPlacementOrDefault,
  hasDedicatedSlot,
  isAdsExcludedPath,
  type AdPlacement,
} from "@/lib/ads/adsense-policy";
import { getSessionLite } from "@/lib/client/session-lite";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * [961] 광고 공간의 애드센스 유닛(클라이언트) — AdZone 안에서만 쓴다.
 *
 * 게이트는 AdSenseLoader·AdSenseUnit 과 같은 3중: 클라이언트 ID · 제외 경로 · 광고 없는
 * 플랜(판정 전에는 안 띄운다). 스크립트는 layout <head> 의 공식 스니펫이 이미 실었고,
 * 광고 요청 잠금(pauseAdRequests)은 AdSenseLoader 가 판정 뒤 푼다 — 여기서 push 한 요청은
 * 잠금이 풀리는 순간 나간다.
 *
 * 애드센스가 <ins> 에 적는 data-ad-status(filled/unfilled)를 CSS(.ad-zone …)가 읽어
 * 채워지면 대체 카드를, 안 채워지면 이 빈 <ins> 를 숨긴다. "광고" 라벨은 채워졌을 때만 보인다.
 */
export function AdZoneUnit({ placement, className = "" }: { placement: AdPlacement; className?: string }) {
  const client = getAdSenseClient();
  const slot = getSlotForPlacementOrDefault(placement);
  const pathname = usePathname() ?? "/";
  const excluded = isAdsExcludedPath(pathname);
  const enabled = Boolean(client && slot) && !excluded;
  const inArticle = placement === "article_end" && hasDedicatedSlot(placement);

  const [adFree, setAdFree] = useState<boolean | null>(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      const s = await getSessionLite();
      if (!alive) return;
      if (s === null) {
        setAdFree(true);
        return;
      }
      const plan = String(s.user?.plan ?? "free").toLowerCase();
      setAdFree(plan === "pro" || plan === "expert" || plan === "enterprise");
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  const show = enabled && adFree === false;

  useEffect(() => {
    if (!show || pushedRef.current) return;
    pushedRef.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* 광고 차단기 등 — 대체 카드가 자리를 채운다 */
    }
  }, [show]);

  if (!show) return null;

  return (
    <div className={`ad-zone-unit ${className}`}>
      <div className="ad-zone-label mb-1">광고</div>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={client ?? undefined}
        data-ad-slot={slot}
        data-ad-format={inArticle ? "fluid" : "auto"}
        data-ad-layout={inArticle ? "in-article" : undefined}
        data-full-width-responsive={inArticle ? undefined : "true"}
      />
    </div>
  );
}

export default AdZoneUnit;
