"use client";

import { getSessionLite } from "@/lib/client/session-lite";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { getAdSenseClient, isAdsExcludedPath } from "@/lib/ads/adsense-policy";

/**
 * Google AdSense Auto ads — `NEXT_PUBLIC_ADSENSE_CLIENT`(ca-pub-…)가 설정된 경우에만 로드.
 *
 * H1·H8 — 여기서 두 가지 게이트를 **실제로 건다**. 전에는 클라이언트 ID 유무만 보고
 * 무조건 로드했다. `lib/ads/adsense-policy.ts` 에 제외 경로 목록과 광고 없는 플랜
 * 판정이 있었지만 부르는 곳이 한 군데도 없어서(importer 0), 목록은 맞는데 아무것도
 * 막지 않는 상태였다 — "완료"로 기록돼 있던 항목이 실은 미집행이었다.
 *
 * 1) **경로 제외** — `/payment`·`/my`·`/subscription`·`/map` 등. 결제 화면에 광고를
 *    붙이는 것은 AdSense 정책 위반 소지가 있고, `/my` 는 포인트·리드·결제 내역이
 *    보이는 자리라 그 위에 외부 광고가 얹히면 안 된다.
 * 2) **플랜 제외** — pro/expert/enterprise 는 광고 제거가 포함된 플랜이다
 *    (`lib/subscriptions/access.ts` 의 `ad_free`, minTier "pro"). 돈을 낸 사람에게
 *    광고를 띄우면 판 것과 다른 물건을 주는 것이다.
 *
 * 판정이 끝나기 전에는 스크립트를 넣지 않는다(모르면 안 띄운다). 비로그인 사용자는
 * 세션 응답이 비어 있어 곧바로 "광고 대상"으로 확정되므로 손해가 없다.
 *
 * 비용 주의: 세션 조회는 **클라이언트 ID 가 있고 제외 경로도 아닐 때만** 나간다.
 * 키가 붙기 전(현재)에는 요청이 한 건도 발생하지 않는다.
 */
export function AdSenseLoader() {
  const client = getAdSenseClient();
  const pathname = usePathname() ?? "/";
  const excludedPath = isAdsExcludedPath(pathname);
  const shouldCheckPlan = Boolean(client) && !excludedPath;

  /** null = 아직 모름, true = 광고 없는 플랜, false = 광고 대상 */
  const [adFree, setAdFree] = useState<boolean | null>(null);

  useEffect(() => {
    if (!shouldCheckPlan) return;
    let alive = true;
    (async () => {
      try {
        // 최적화 26 — 공유 세션 조회로 수렴
        const data = await getSessionLite();
        if (data === null) {
          // 세션 조회 실패는 "비로그인"과 구분되지 않는다. 광고를 띄우지 않는 쪽으로
          // 둔다 — 결제한 사람에게 광고가 나가는 것이 반대 실수보다 나쁘다.
          if (alive) setAdFree(true);
          return;
        }
        const plan =
          typeof data === "object" && data !== null
            ? String(
                (data as { user?: { plan?: unknown } }).user?.plan ?? "free",
              ).toLowerCase()
            : "free";
        if (alive) setAdFree(plan === "pro" || plan === "expert" || plan === "enterprise");
      } catch {
        if (alive) setAdFree(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [shouldCheckPlan]);

  if (!client || excludedPath) return null;
  if (adFree !== false) return null;

  return (
    <Script
      id="adsense-auto"
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}
