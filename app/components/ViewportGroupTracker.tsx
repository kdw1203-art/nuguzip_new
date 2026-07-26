"use client";

/**
 * viewport_group_change 발신부 (반응형 QA 체크리스트 "추적" 항목).
 *
 * withViewportMetadata() 헬퍼만 있고 실제로 이벤트를 쏘는 곳이 없었다 —
 * 계측이 도는 것처럼 보였지만 데이터는 0건이었다. 이 컴포넌트가:
 *   - 최초 마운트 시 현재 뷰포트 그룹을 1회 기록하고
 *   - 리사이즈·회전으로 그룹(mobile/tablet/desktop)이 실제로 바뀔 때만 발신한다
 *     (px 단위 리사이즈마다 쏘면 노이즈 — 그룹 경계를 넘을 때만 의미가 있다)
 * 발신처: /api/platform/event(1차 진실) + GA4 미러(동의 시에만 gtag 존재).
 */
import { useEffect, useRef } from "react";
import {
  breakpointFromWidth,
  buildViewportAnalyticsContext,
  getOrSetEntryRoute,
  withViewportMetadata,
} from "@/lib/analytics/viewport-context";
import { mirrorFunnelToGtag } from "@/lib/analytics/gtag-mirror";

const EVENT = "viewport_group_change";

export function ViewportGroupTracker() {
  const lastGroup = useRef<string | null>(null);

  useEffect(() => {
    const emit = (kind: "initial" | "change") => {
      const width = window.innerWidth;
      const ctx = {
        ...buildViewportAnalyticsContext(width, navigator.userAgent),
        entry_route: getOrSetEntryRoute(window.location.pathname, window.location.search),
      };
      const metadata = withViewportMetadata({ kind, from_group: lastGroup.current }, ctx);
      void fetch("/api/platform/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventName: EVENT, metadata }),
        keepalive: true,
      }).catch(() => {
        /* 계측 실패는 조용히 — 사용자 경험에 영향 없음 */
      });
      mirrorFunnelToGtag(EVENT, {
        kind,
        viewport_group: ctx.viewport_group,
        viewport_width_bucket: String(ctx.viewport_width_bucket),
      });
      lastGroup.current = ctx.viewport_group;
    };

    // 최초 1회 — 세션의 시작 그룹
    emit("initial");

    // 그룹 경계를 넘을 때만 발신 (디바운스 300ms)
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const group = breakpointFromWidth(window.innerWidth);
        if (group !== lastGroup.current) emit("change");
      }, 300);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
