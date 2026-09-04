"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * [962] 당겨서 새로고침 — 모션 시스템 v1.0 §02 "스피너 대신 온점이 물방울처럼 늘어난다".
 *
 * 언제만: 홈 화면에 설치한 앱(standalone)에서. 브라우저에는 이미 자체 새로고침 제스처가
 * 있어 겹치면 두 번 당겨진다. 맨 위(scrollY 0)에서 72px 이상 아래로 끌면 한지 띠가
 * 내려오고 온점이 늘어나며 `router.refresh()` 로 서버 데이터를 다시 받는다.
 * 입력 중(input/textarea 포커스)이나 가로 스크롤 레일 위에서는 반응하지 않는다.
 */
const THRESHOLD = 72;

export function PullToRefresh() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pull" | "refresh">("idle");
  const startY = useRef<number | null>(null);
  const armed = useRef(false);

  useEffect(() => {
    let standalone = false;
    try {
      standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
    } catch {
      standalone = false;
    }
    if (!standalone) return;

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || e.touches.length !== 1) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable], .scroll-x-hidden-bar, .ticker-band")) return;
      startY.current = e.touches[0]!.clientY;
      armed.current = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0]!.clientY - startY.current;
      if (dy > THRESHOLD && window.scrollY === 0) {
        if (!armed.current) {
          armed.current = true;
          setState("pull");
        }
      } else if (armed.current) {
        armed.current = false;
        setState("idle");
      }
    };
    const onEnd = () => {
      if (armed.current) {
        armed.current = false;
        setState("refresh");
        router.refresh();
        window.setTimeout(() => setState("idle"), 1100);
      }
      startY.current = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  return (
    <div className="njn-ptr" data-state={state} aria-hidden={state === "idle"} role="status">
      <span className="njn-dot" />
      {state === "refresh" ? "지금 불러오는 중" : "놓으면 새로고침"}
    </div>
  );
}

export default PullToRefresh;
