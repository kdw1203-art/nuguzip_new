"use client";

type TrackInput = {
  eventName: string;
  source?: string;
  campaign?: string;
  path?: string;
  metadata?: Record<string, unknown>;
  /* A7 — 실험 태그. 붙어 있으면 이 이벤트가 그 실험의 분모/분자로 집계된다.
     서버가 등록부와 대조해 모르는 값은 버린다(lib/experiments/server.ts). */
  experimentKey?: string;
  variant?: string;
  /** 비로그인 subject 식별용 익명 ID. 로그인 상태면 서버가 이메일을 우선한다. */
  anonId?: string;
};

export function trackPlatformEvent(input: TrackInput): void {
  try {
    const body = JSON.stringify({
      eventName: input.eventName,
      source: input.source,
      campaign: input.campaign,
      path: input.path ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
      metadata: input.metadata ?? {},
      ...(input.experimentKey && input.variant
        ? { experimentKey: input.experimentKey, variant: input.variant, anonId: input.anonId }
        : {}),
    });

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/platform/event", blob);
      return;
    }

    void fetch("/api/platform/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // Metrics should never break UX flows.
  }
}
