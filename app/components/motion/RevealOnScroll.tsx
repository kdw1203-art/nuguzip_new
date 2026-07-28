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
 * 올려 준다. 화면 안에 이미 들어와 있는 요소는 건드리지 않는다(이미 읽고
 * 있는 글이 갑자기 사라졌다 나타나면 그건 연출이 아니라 결함이다).
 */

/** 이 비율보다 아래에 있는 요소만 숨겼다가 올린다 (뷰포트 높이 대비) */
const BELOW_FOLD = 0.92;

export function RevealOnScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          if (el instanceof HTMLElement) el.dataset.reveal = "shown";
          observer.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.04 },
    );

    const scan = () => {
      const viewport = window.innerHeight || 0;
      const nodes = document.querySelectorAll<HTMLElement>('[data-reveal=""]');
      for (const el of nodes) {
        if (el.getBoundingClientRect().top <= viewport * BELOW_FOLD) {
          /* 이미 보이는 것: 표시만 바꿔 두고 애니메이션은 걸지 않는다.
             빈 문자열로 남겨 두면 다음 scan 에서 또 후보가 된다. */
          el.dataset.reveal = "shown";
          continue;
        }
        el.dataset.reveal = "pending";
        observer.observe(el);
      }
    };

    scan();

    /* 피드·목록은 클라이언트에서 나중에 붙는다. 붙을 때마다 훑되, 한 프레임에
       한 번으로 묶는다 — 노드 하나 추가될 때마다 전체를 훑으면 그 자체가
       스크롤을 끊는다. */
    let queued = 0;
    const mutation = new MutationObserver(() => {
      if (queued) return;
      queued = window.requestAnimationFrame(() => {
        queued = 0;
        scan();
      });
    });
    mutation.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (queued) window.cancelAnimationFrame(queued);
      mutation.disconnect();
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}

export default RevealOnScroll;
