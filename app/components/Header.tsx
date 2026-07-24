"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Logo } from "./Logo";
import { HeaderAuth } from "./HeaderAuth";
import { HeaderSearch } from "./HeaderSearch";
import { MobileMenu } from "./MobileMenu";
import { NotificationBell } from "./NotificationBell";
import { NAV } from "./nav-data";
import { Icon } from "./Icon";

/** 9m GNB — 호버 드롭다운(리퀴드 글래스) · 트렌드 갱신: 스크롤 인지 · 언더라인 인디케이터
 *  NAV 데이터는 nav-data.ts 공유 (데스크탑 GNB · 모바일 전체 메뉴 동기화) */

/** 글래스 플로팅 GNB — 데스크탑은 메뉴+검색+CTA, 모바일은 로고+아이콘 */
export function Header() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // 스크롤 인지 — 내려가면 헤더 축소·글래스 강화·그림자 상승 (SSR: window 가드)
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-50 px-3.5 md:px-5"
      style={{
        paddingTop: scrolled
          ? "max(8px, env(safe-area-inset-top, 0px))"
          : "max(14px, env(safe-area-inset-top, 0px))",
        transition: "padding-top var(--dur-sm) var(--ease-out)",
      }}
    >
      <div
        className={`header-shell mx-auto flex max-w-[1240px] items-center gap-3 rounded-2xl px-4 md:gap-6 md:px-5 ${
          scrolled ? "glass-strong header-scrolled h-12" : "glass h-14"
        }`}
      >
        <Link href="/" aria-label="누구집 홈" className="press shrink-0">
          <Logo />
        </Link>

        {/* 데스크탑 메뉴 — 9m 호버 드롭다운 + 언더라인 인디케이터 */}
        <nav className="hidden gap-0.5 text-sm font-semibold text-text-1 md:flex">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <div key={item.label} className="group relative">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-active={active ? "true" : undefined}
                  className={
                    active
                      ? "nav-underline block rounded-[10px] bg-primary-soft px-3.5 py-[7px] text-primary transition-colors"
                      : "nav-underline block rounded-[10px] px-3.5 py-[7px] text-text-1 transition-colors hover:bg-[rgba(29,79,216,.07)] hover:text-primary"
                  }
                >
                  {item.label}
                </Link>
                {item.children && (
                  <div className="invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition-all duration-[180ms] group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                    <div
                      className="glass-strong dropdown-panel min-w-[168px] rounded-2xl p-1.5"
                      style={{ background: "rgba(255,255,255,.9)" }}
                    >
                      {item.children.map((c) => (
                        <Link
                          key={c.href + c.label}
                          href={c.href}
                          className="block rounded-[10px] px-3 py-2 text-[13px] font-semibold text-text-1 transition-all duration-[120ms] hover:translate-x-0.5 hover:bg-[rgba(29,79,216,.08)] hover:text-primary"
                        >
                          {c.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* 데스크탑 검색 — P2-14 인라인 자동완성 (HeaderSearch) */}
        <HeaderSearch />

        {/* 데스크탑 알림 진입점 (P2-3) — 미읽음 배지 포함(B10) */}
        <NotificationBell variant="desktop" />

        {/* 화면당 primary CTA는 1개 — 노트 쓰기 (마이크로 인터랙션: 리프트 + 글로우) */}
        <Link
          href="/notes/new"
          className="btn-primary btn-cta press hidden px-4 py-[9px] text-[13px] transition-transform hover:-translate-y-0.5 hover:[box-shadow:var(--shadow-glow)] md:block"
        >
          노트 쓰기
        </Link>

        {/* 세션 영역 — 로그인 시 아바타+플랜 배지+드롭다운 / 비로그인 시 로그인 링크 */}
        <HeaderAuth />

        {/* 모바일 아이콘 + 전체 메뉴(☰) */}
        <div className="flex items-center gap-3 text-text-1 md:hidden">
          <Link href="/search" aria-label="검색" className="press flex h-8 w-8 items-center justify-center">
            <Icon name="search" size={19} />
          </Link>
          <NotificationBell variant="mobile" />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
