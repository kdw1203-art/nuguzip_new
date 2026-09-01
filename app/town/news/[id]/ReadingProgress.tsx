"use client";

import { useEffect, useRef } from "react";

/* [945-G] 읽기 진행 바 — 상세 상단 3px 그라디언트.
   rAF 스로틀 + transform(scaleX)만 갱신(리플로우 없음). 스크롤이 필요 없을
   만큼 짧은 글이면 바를 아예 그리지 않는다(항상 100%인 바는 정보가 아니다).
   reduced-motion 은 CSS 전환 자체가 없어 그대로 둔다 — 진행 표시는 모션이
   아니라 상태다. */
export function ReadingProgress() {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      if (max < 240) {
        bar.style.transform = "scaleX(0)";
        return;
      }
      const p = Math.min(1, Math.max(0, window.scrollY / max));
      bar.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return <div ref={barRef} className="read-progress" aria-hidden="true" />;
}
