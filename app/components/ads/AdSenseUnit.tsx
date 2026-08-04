"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getAdSenseClient, isAdsExcludedPath } from "@/lib/ads/adsense-policy";
import { getSessionLite } from "@/lib/client/session-lite";

/**
 * AdSense 수동 디스플레이 유닛 — **데스크탑 전용** (소유자 요청 2026-08-03:
 * 모바일 제외, 서비스 이용에 불편 없는 빈공간에만).
 *
 * 게이트는 Auto ads 로더(AdSenseLoader)와 동일한 3중이다:
 *  1) NEXT_PUBLIC_ADSENSE_CLIENT 미설정 → 아무것도 렌더하지 않는다.
 *  2) 제외 경로(/payment·/my·/subscription 등) → 미렌더.
 *  3) 광고 없는 플랜(pro/expert/enterprise) → 미렌더. 판정 전에는 안 띄운다
 *     (모르면 안 띄운다 — 결제한 사람에게 광고가 나가는 쪽이 더 나쁜 실수).
 *
 * 슬롯 ID 는 NEXT_PUBLIC_ADSENSE_SLOT_WEB (애드센스 대시보드에서 만든
 * 디스플레이 광고 단위 ID). 미설정이면 유닛 미렌더 — Auto ads 만 동작한다.
 * "광고 준비 중" 같은 빈 상자는 만들지 않는다(AdSlot 과 같은 원칙).
 *
 * 스크립트는 AdSenseLoader 가 이미 실어 둔 것을 재사용한다(경로·플랜 게이트가
 * 같으므로, 이 유닛이 그려지는 조건에서는 스크립트도 로드돼 있다).
 */

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdSenseUnit({ className }: { className?: string }) {
  const client = getAdSenseClient();
  /* 슬롯 ID — 소유자 제공(2026-08-03, "nuguzip" 디스플레이 광고 단위).
     페이지 소스에 노출되는 공개 값이라 기본값으로 둔다. env 우선. */
  const slot = process.env.NEXT_PUBLIC_ADSENSE_SLOT_WEB?.trim() || "9196083291";
  const pathname = usePathname() ?? "/";
  const excluded = isAdsExcludedPath(pathname);
  const enabled = Boolean(client && slot) && !excluded;

  /** null = 판정 전(미렌더), false = 광고 대상 */
  const [adFree, setAdFree] = useState<boolean | null>(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      // 최적화 26 — 공유 세션 조회로 수렴. null(조회 실패)이면 종전과 같이
      // "모르면 안 띄운다"(adFree=true) — 결제자에게 광고가 나가는 쪽이 더 나쁘다.
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
      // 스크립트 차단(광고 차단기 등) — 빈 영역 없이 조용히 무시
    }
  }, [show]);

  if (!show) return null;

  return (
    /* hidden lg:block — 모바일·태블릿 제외는 CSS 로도 이중 보장.
       라벨을 붙여 광고임을 명시한다(콘텐츠로 위장 금지). */
    <div className={`hidden lg:block ${className ?? ""}`}>
      <div className="mb-1 text-[10px] font-semibold tracking-wide text-text-3">광고</div>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={client ?? undefined}
        data-ad-slot={slot ?? undefined}
        data-ad-format="auto"
        data-full-width-responsive="false"
      />
    </div>
  );
}
