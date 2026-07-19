"use client";

type TrackInput = {
  eventName: string;
  source?: string;
  campaign?: string;
  path?: string;
  metadata?: Record<string, unknown>;
};

export function trackPlatformEvent(input: TrackInput): void {
  try {
    const body = JSON.stringify({
      eventName: input.eventName,
      source: input.source,
      campaign: input.campaign,
      path: input.path ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
      metadata: input.metadata ?? {},
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
