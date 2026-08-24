"use client";

/* G2 — Web Vitals RUM 수집.
   [OPT-01] next/web-vitals 훅 → web-vitals/attribution 직접 사용으로 교체.
   지표값만으로는 "어느 페이지의 어떤 요소가 LCP 범인인지"를 알 수 없었다
   (2026-08-23 LCP p75 3,872ms 실패 — 원인 불명). attribution 빌드는
   LCP 요소 선택자·리소스 URL, INP 의 이벤트 대상·타입까지 알려준다.
   기존 /api/metrics/web-vitals 엔드포인트(web_vitals 테이블)로 전송.
   sendBeacon 우선(언로드 안전), 실패 시 keepalive fetch. 렌더 없음. */
import { useEffect } from "react";
import {
  onCLS,
  onFCP,
  onINP,
  onLCP,
  onTTFB,
  type CLSMetricWithAttribution,
  type FCPMetricWithAttribution,
  type INPMetricWithAttribution,
  type LCPMetricWithAttribution,
  type TTFBMetricWithAttribution,
} from "web-vitals/attribution";

type AnyMetric =
  | CLSMetricWithAttribution
  | FCPMetricWithAttribution
  | INPMetricWithAttribution
  | LCPMetricWithAttribution
  | TTFBMetricWithAttribution;

function attributionOf(metric: AnyMetric): { element: string | null; attrUrl: string | null } {
  const a = metric.attribution as Record<string, unknown> | undefined;
  if (!a) return { element: null, attrUrl: null };
  /* LCP: element(선택자)·url(이미지·리소스). INP: interactionTarget·interactionType.
     CLS: largestShiftTarget. 나머지는 null — 지어내지 않는다. */
  const element =
    (typeof a.element === "string" && a.element) ||
    (typeof a.interactionTarget === "string" &&
      `${a.interactionTarget}${typeof a.interactionType === "string" ? ` (${a.interactionType})` : ""}`) ||
    (typeof a.largestShiftTarget === "string" && a.largestShiftTarget) ||
    null;
  const attrUrl = typeof a.url === "string" && a.url ? a.url : null;
  return { element, attrUrl };
}

function send(metric: AnyMetric) {
  try {
    const { element, attrUrl } = attributionOf(metric);
    const body = JSON.stringify({
      metric: metric.name,
      value: metric.value,
      rating: metric.rating,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
      navType: metric.navigationType,
      element,
      attrUrl,
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
}

export function WebVitalsReporter() {
  useEffect(() => {
    /* 각 on* 는 내부적으로 페이지 수명당 한 번(또는 값 갱신 시)만 콜백한다.
       effect 재실행으로 리스너가 중복 등록되지 않도록 전역 1회 가드. */
    const w = window as unknown as { __nzVitalsWired?: boolean };
    if (w.__nzVitalsWired) return;
    w.__nzVitalsWired = true;
    onLCP(send);
    onINP(send);
    onCLS(send);
    onFCP(send);
    onTTFB(send);
  }, []);
  return null;
}
