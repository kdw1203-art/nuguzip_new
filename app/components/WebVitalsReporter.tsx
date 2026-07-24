"use client";

/* G2 — Web Vitals RUM 수집. next/web-vitals 훅으로 실사용자 LCP·INP·CLS 등을
   기존 /api/metrics/web-vitals 엔드포인트(web_vitals 테이블)로 전송한다.
   sendBeacon 우선(언로드 안전), 실패 시 keepalive fetch. 렌더 없음. */
import { useReportWebVitals } from "next/web-vitals";

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    try {
      const body = JSON.stringify({
        metric: metric.name,
        value: metric.value,
        rating: metric.rating,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
        navType: metric.navigationType,
      });
      const url = "/api/metrics/web-vitals";
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      } else {
        void fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      }
    } catch {
      // 수집 실패는 무시 — 사용자 경험에 영향 없음
    }
  });
  return null;
}
