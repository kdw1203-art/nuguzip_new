"use client";

import Script from "next/script";
import { getAdSenseClient } from "@/lib/ads/adsense-policy";

/**
 * Google AdSense Auto ads — NEXT_PUBLIC_ADSENSE_CLIENT(ca-pub-…)가 설정된 경우에만 로드.
 * (구 components/ads/adsense-script-loader.tsx 참고 — 쿠키 동의·플랜 게이트는 추후 연결)
 */
export function AdSenseLoader() {
  const client = getAdSenseClient();
  if (!client) return null;

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
