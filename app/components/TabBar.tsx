"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const TABS = [
  { label: "홈", icon: "⌂", href: "/" },
  { label: "지도", icon: "◎", href: "/map" },
  { label: "노트", icon: "＋", href: "/notes/new", center: true },
  { label: "동네", icon: "✎", href: "/town" },
  { label: "마이", icon: "◉", href: "/my" },
];

/** 모바일 하단 글래스 탭바 — 중앙 ＋는 핵심 액션 '노트 쓰기' 고정 */
export function TabBar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      className="glass-strong fixed bottom-[18px] left-[18px] right-[18px] z-50 grid grid-cols-5 rounded-3xl px-2 pb-3 pt-2.5 text-center md:hidden"
      aria-label="하단 내비게이션"
    >
      {TABS.map((tab) =>
        tab.center ? (
          <Link key={tab.label} href={tab.href} className="block">
            <span
              className="mx-auto -mt-5 mb-0.5 flex h-[42px] w-[42px] items-center justify-center rounded-full bg-primary text-[21px] text-white"
              style={{ boxShadow: "var(--shadow-cta)" }}
            >
              {tab.icon}
            </span>
            <span className="text-[10px] font-bold text-primary">
              {tab.label}
            </span>
          </Link>
        ) : (
          <Link
            key={tab.label}
            href={tab.href}
            className={`block text-[10px] ${
              isActive(tab.href) ? "font-bold text-primary" : "text-text-3"
            }`}
          >
            <span className="block text-[17px] leading-tight">{tab.icon}</span>
            {tab.label}
          </Link>
        )
      )}
    </nav>
  );
}
