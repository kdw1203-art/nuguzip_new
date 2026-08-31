"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * 스크롤하며 내려오는 섹션을 한 번씩 살려 올린다.
 *
 * 쓰는 법은 **속성 하나**다. 서버 컴포넌트에서도 `data-reveal=""` 만 붙이면
 * 된다 — 이 파일을 import 할 필요가 없다. 그래서 연출을 넣자고 서버
 * 컴포넌트를 클라이언트로 내릴 일이 없다.
 *
 * ── 기본값이 "보임" 인 이유 ─────────────────────────────────────────────
 * 흔한 구현은 CSS 에서 `opacity: 0` 으로 시작해 스크립트가 보이게 만든다.
 * 그러면 스크립트가 한 번 실패하는 날 본문이 통째로 사라진다 — 검색 크롤러나
 * JS 차단 환경에서는 그게 기본 상태가 된다. 여기서는 서버가 그린 상태가
 * 그대로 보이는 상태이고, **화면 밖에 있는 것만** 스크립트가 잠시 숨겼다가
 * 올려 준다.
 *
 * ── 빈 공간 방지(2026-08-28) ────────────────────────────────────────────
 * 이 연출의 대기 상태(`pending`)는 `opacity: 0` 인데 **자리는 그대로 차지한다**.
 * 즉 올려 주는 데 실패하면 그 자리는 "아무것도 없는 빈 칸"으로 남는다.
 * 홈 실측에서 로드 직후 257px 짜리 블록 하나가 정확히 그 상태였다.
 *
 * IntersectionObserver 하나에만 기대면 그 실패가 곧 빈 칸이므로, 보증을
 * 세 겹으로 둔다. 원칙은 하나다 — **화면에 보이는 자리는 반드시 채워져 있다.**
 *   ① 옵저버: 평소 경로(연출이 붙는다)
 *   ② 스크롤·리사이즈 백스톱: 화면 안에 들어온 대기 요소를 무조건 깨운다.
 *      옵저버가 어떤 이유로든 안 울려도 스크롤 한 번이면 채워진다.
 *   ③ 안전 타이머: 그래도 남은 대기 요소를 SAFETY_MS 뒤 전부 깨운다.
 * 셋 다 같은 함수(`show`)로 수렴하므로 상태가 갈라지지 않는다.
 *
 * 화면보다 큰 블록은 아예 숨기지 않는다. 그런 블록이 늦게 나타나면 연출이
 * 아니라 "한참 비어 있다가 갑자기 생기는 화면"으로 읽힌다.
 */

/** 이 비율보다 아래에 있는 요소만 숨겼다가 올린다 (뷰포트 높이 대비) */
const BELOW_FOLD = 0.92;
/** 이 시간이 지나도 대기 중이면 연출을 포기하고 그냥 보여 준다 */
const SAFETY_MS = 2_000;

export function RevealOnScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const show = (el: HTMLElement) => {
      if (el.dataset.reveal === "shown") return;
      el.dataset.reveal = "shown";
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          if (el instanceof HTMLElement) show(el);
          observer.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.04 },
    );

    /** 대기 중(pending)인데 이미 화면에 걸친 것들을 깨운다 — 빈 칸 방지 보증 */
    const sweep = () => {
      const viewport = window.innerHeight || 0;
      for (const el of document.querySelectorAll<HTMLElement>('[data-reveal="pending"]')) {
        if (el.getBoundingClientRect().top <= viewport * BELOW_FOLD) {
          show(el);
          observer.unobserve(el);
        }
      }
    };

    const scan = () => {
      const viewport = window.innerHeight || 0;
      const nodes = document.querySelectorAll<HTMLElement>('[data-reveal=""]');
      for (const el of nodes) {
        const rect = el.getBoundingClientRect();
        /* 이미 보이는 것: 표시만 바꿔 두고 애니메이션은 걸지 않는다. */
        if (rect.top <= viewport * BELOW_FOLD) {
          show(el);
          continue;
        }
        /* 화면보다 큰 블록은 숨기지 않는다 — 비어 보이는 시간이 길어진다 */
        if (viewport > 0 && rect.height > viewport) {
          show(el);
          continue;
        }
        el.dataset.reveal = "pending";
        observer.observe(el);
      }
      sweep();
    };

    scan();

    /* 피드·목록은 클라이언트에서 나중에 붙는다. 붙을 때마다 훑되, 한 프레임에
       한 번으로 묶는다. */
    let queued = 0;
    const schedule = () => {
      if (queued) return;
      queued = window.requestAnimationFrame(() => {
        queued = 0;
        scan();
      });
    };

    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { childList: true, subtree: true });

    /* 백스톱 — 옵저버가 안 울려도 스크롤/리사이즈 한 번이면 화면 안은 채워진다 */
    let sweepQueued = 0;
    const onView = () => {
      if (sweepQueued) return;
      sweepQueued = window.requestAnimationFrame(() => {
        sweepQueued = 0;
        sweep();
      });
    };
    window.addEventListener("scroll", onView, { passive: true });
    window.addEventListener("resize", onView, { passive: true });
    /* bfcache 복귀는 effect 가 다시 돌지 않는다 — 그때도 한 번 훑는다 */
    window.addEventListener("pageshow", onView);

    /* 마지막 보증 — 여기까지 왔는데도 대기 중이면 연출을 포기한다. */
    const safety = window.setTimeout(() => {
      for (const el of document.querySelectorAll<HTMLElement>('[data-reveal="pending"]')) {
        show(el);
        observer.unobserve(el);
      }
    }, SAFETY_MS);

    return () => {
      if (queued) window.cancelAnimationFrame(queued);
      if (sweepQueued) window.cancelAnimationFrame(sweepQueued);
      window.clearTimeout(safety);
      window.removeEventListener("scroll", onView);
      window.removeEventListener("resize", onView);
      window.removeEventListener("pageshow", onView);
      mutation.disconnect();
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}

export default RevealOnScroll;
