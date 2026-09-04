"use client";

import Link from "next/link";
import { useRef, type MouseEvent, type ReactNode } from "react";

/**
 * [961] 자석 버튼 — 인터랙션 라이브러리 v2.0 §04. 커서를 살짝 따라간다(x 28% · y 40%).
 * 핵심 CTA **하나**에만 쓴다(한 화면 호버 2종 규칙). 터치·coarse 포인터에서는 아무 일도 안 한다.
 */
function fine(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function MagneticLink({
  href,
  className = "",
  children,
  ...rest
}: {
  href: string;
  className?: string;
  children: ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  const ref = useRef<HTMLAnchorElement>(null);
  const onMove = (e: MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el || !fine()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width / 2) * 0.28;
    const y = (e.clientY - r.top - r.height / 2) * 0.4;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <Link
      ref={ref}
      href={href}
      className={`njn-magnet ${className}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      {...rest}
    >
      {children}
    </Link>
  );
}

/** 3D 기울임 — 프리미엄 카드용(최대 ±9°). 데스크톱 전용. */
export function tiltHandlers(max = 9) {
  return {
    onMouseMove: (e: MouseEvent<HTMLElement>) => {
      if (!fine()) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(600px) rotateY(${(x * max * 2).toFixed(2)}deg) rotateX(${(-y * max * 2).toFixed(2)}deg) scale(1.02)`;
    },
    onMouseLeave: (e: MouseEvent<HTMLElement>) => {
      e.currentTarget.style.transform = "";
    },
  };
}
