"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Logo } from "./Logo";

const NAV = [
  { label: "홈", href: "/" },
  { label: "임장노트", href: "/notes" },
  { label: "지도", href: "/map" },
  { label: "AI 분석", href: "/analysis" },
  { label: "동네이야기", href: "/town" },
];

/** 글래스 플로팅 GNB — 데스크탑은 메뉴+검색+CTA, 모바일은 로고+아이콘 */
export function Header() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 px-3.5 pt-3.5 md:px-5 md:pt-4">
      <div className="glass mx-auto flex h-14 max-w-[1240px] items-center gap-3 rounded-2xl px-4 md:gap-6 md:px-5">
        <Link href="/" aria-label="누구집 홈">
          <Logo />
        </Link>

        {/* 데스크탑 메뉴 */}
        <nav className="hidden gap-0.5 text-sm font-semibold text-text-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={
                isActive(item.href)
                  ? "rounded-[10px] bg-[rgba(29,79,216,.12)] px-3.5 py-[7px] text-primary"
                  : "rounded-[10px] px-3.5 py-[7px] text-text-1 transition-colors hover:bg-[rgba(29,79,216,.07)] hover:text-primary"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {/* 데스크탑 검색 */}
        <Link
          href="/search"
          className="hidden w-[200px] items-center gap-2 rounded-xl bg-[rgba(255,255,255,.7)] px-3.5 py-2 text-[13px] text-text-3 lg:flex"
        >
          ⌕ 지역, 단지명 검색
        </Link>

        {/* 화면당 primary CTA는 1개 — 노트 쓰기 */}
        <Link
          href="/notes/new"
          className="btn-primary btn-cta hidden px-4 py-[9px] text-[13px] md:block"
        >
          노트 쓰기
        </Link>

        {/* 모바일 아이콘 */}
        <div className="flex gap-3.5 text-base text-text-1 md:hidden">
          <Link href="/search" aria-label="검색">⌕</Link>
          <Link href="/notifications" aria-label="알림">🔔</Link>
        </div>
      </div>
    </header>
  );
}
