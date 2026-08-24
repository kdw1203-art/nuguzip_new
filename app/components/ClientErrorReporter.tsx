"use client";

/* [OPT-43] 전역 클라이언트 에러 수집 — 렌더 없음. 같은 메시지는 세션당 1회만
   보내 도배를 막는다(서버에도 IP 레이트리밋이 한 겹 더 있다). */
import { useEffect } from "react";

export function ClientErrorReporter() {
  useEffect(() => {
    const seen = new Set<string>();
    const send = (message: string, stack?: string) => {
      const key = message.slice(0, 120);
      if (seen.has(key) || seen.size > 20) return;
      seen.add(key);
      try {
        const body = JSON.stringify({
          message,
          stack,
          path: window.location.pathname,
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/metrics/client-error", new Blob([body], { type: "application/json" }));
        } else {
          void fetch("/api/metrics/client-error", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          });
        }
      } catch {
        /* 계측 실패는 무시 */
      }
    };
    const onError = (e: ErrorEvent) => send(e.message || "unknown error", e.error?.stack);
    const onReject = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      send(
        r instanceof Error ? r.message : typeof r === "string" ? r : "unhandled rejection",
        r instanceof Error ? r.stack : undefined,
      );
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, []);
  return null;
}
