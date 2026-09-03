"use client";

import { getSessionLite } from "@/lib/client/session-lite";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getAdSenseClient, isAdsExcludedPath } from "@/lib/ads/adsense-policy";

/**
 * Google AdSense — 광고 요청 게이트 (960 에서 역할이 바뀌었다).
 *
 * 예전(H1·H8): 이 컴포넌트가 세션 판정 뒤 `adsbygoogle.js` 를 **클라이언트에서**
 * 끼워 넣었다. 정책 게이트(경로·플랜)는 맞았지만, 스크립트가 정적 HTML 에 없어서
 * 애드센스 "코드 삽입" 확인 크롤러가 못 볼 수 있었고 자동 광고도 판정 지연만큼 늦었다.
 *
 * 지금: 공식 스니펫은 app/layout.tsx <head> 에 그대로 있고(모든 페이지), 그 앞에서
 * `adsbygoogle.pauseAdRequests = 1` 로 **광고 요청만** 잠근다. 이 컴포넌트는
 * 두 게이트를 판정한 뒤 잠금을 푼다(0) — 스크립트 유무가 아니라 요청 여부를 다룬다.
 *
 * 1) **경로 제외** — `/payment`·`/my`·`/subscription`·`/map` 등(adsense-policy 목록).
 *    결제 화면 위 광고는 정책 위반 소지, `/my` 는 결제 내역이 보이는 자리다.
 *    클라이언트 내비게이션으로 제외 경로에 들어가면 다시 잠근다(1).
 * 2) **플랜 제외** — pro/expert/enterprise 는 광고 제거가 포함된 플랜
 *    (`lib/subscriptions/access.ts` 의 `ad_free`). 돈을 낸 사람에게 광고를 띄우면
 *    판 것과 다른 물건을 주는 것이다.
 *
 * 판정이 끝나기 전에는 풀지 않는다(모르면 안 띄운다). 세션 조회 실패도 "광고 없음"
 * 쪽으로 둔다 — 결제한 사람에게 광고가 나가는 것이 반대 실수보다 나쁘다.
 * 비로그인은 세션 응답이 비어 있어 곧바로 광고 대상으로 확정된다.
 *
 * 비용: 세션 조회는 클라이언트 ID 가 있고 제외 경로가 아닐 때만 나간다(공유 캐시).
 */

type AdsQueue = unknown[] & { pauseAdRequests?: number };

function setPaused(paused: boolean) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { adsbygoogle?: AdsQueue };
  const q = (w.adsbygoogle = w.adsbygoogle ?? ([] as unknown as AdsQueue));
  q.pauseAdRequests = paused ? 1 : 0;
}

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

  /* 잠금 상태를 경로·플랜 판정에 맞춘다. 제외 경로면 항상 잠금, 판정 전이면 잠금,
     광고 대상으로 확정된 뒤에만 푼다. */
  useEffect(() => {
    if (!client) return;
    setPaused(excludedPath || adFree !== false);
  }, [client, excludedPath, adFree]);

  return null;
}
