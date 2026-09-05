"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** 이만큼 내려갔을 때만 뜬다 — 한 화면 남짓은 손가락으로 올리는 게 더 빠르다 */
const SHOW_AFTER_PX = 800;

/**
 * [966] 맨 위로 — 긴 목록·리포트에서 우하단에 뜨는 44px 원.
 *
 * 자리: right 14px · bottom = 탭바 위 12px (--nz-tabbar-offset). /town 과 /notes 는
 * 같은 자리에 글쓰기 FAB(52px, njn-fab)가 있어 그 **위로 60px** 올린다(52 + 여백 8).
 * 왼쪽으로 비키는 방식은 버리고 위로 올리는 쪽을 골랐다 — 오른쪽 엄지 동선을 유지하고,
 * 본문 카드 위를 가로로 가리지 않는다. FAB 는 md 이상에서 사라지므로 올림도 md 에서
 * 풀린다(CSS 가 판정, .back-to-top[data-lifted]).
 *
 * 보임/숨김은 CSS 클래스(.is-visible)로 페이드·스케일 — 숨김 상태는 visibility:hidden
 * 이라 탭 순서·보조기술에도 안 잡힌다. 감속 모션 설정이면 전환 없이 즉시 바뀐다.
 */
export function BackToTop() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      setVisible(window.scrollY > SHOW_AFTER_PX);
    };
    /* 스크롤마다 setState 하지 않는다 — 프레임당 한 번 */
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const lifted = pathname.startsWith("/town") || pathname.startsWith("/notes");

  const toTop = () => {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  return (
    <button
      type="button"
      aria-label="맨 위로"
      onClick={toTop}
      data-lifted={lifted ? "true" : undefined}
      className={`back-to-top press njn-lift fixed z-40 flex h-11 w-11 items-center justify-center rounded-full bg-brand-navy text-on-dark shadow-[0_6px_18px_rgba(11,37,69,.3)] ${
        visible ? "is-visible" : ""
      }`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 14.5 12 8.5l6 6" />
      </svg>
    </button>
  );
}
