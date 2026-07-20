"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Logo } from "./Logo";
import { HeaderAuth } from "./HeaderAuth";
import { HeaderSearch } from "./HeaderSearch";
import { MobileMenu } from "./MobileMenu";
import { NAV } from "./nav-data";

/** 9m GNB — 호버 드롭다운(리퀴드 글래스, riseIn 180ms)
 *  NAV 데이터는 nav-data.ts 공유 (데스크탑 GNB · 모바일 전체 메뉴 동기화) */

/** 글래스 플로팅 GNB — 데스크탑은 메뉴+검색+CTA, 모바일은 로고+아이콘 */
export function Header() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className="sticky top-0 z-50 px-3.5 md:px-5"
      style={{ paddingTop: "max(14px, env(safe-area-inset-top, 0px))" }}
    >
      <div className="glass mx-auto flex h-14 max-w-[1240px] items-center gap-3 rounded-2xl px-4 md:gap-6 md:px-5">
        <Link href="/" aria-label="누구집 홈">
          <Logo />
        </Link>

        {/* 데스크탑 메뉴 — 9m 호버 드롭다운 */}
        <nav className="hidden gap-0.5 text-sm font-semibold text-text-1 md:flex">
          {NAV.map((item) => (
            <div key={item.label} className="group relative">
              <Link
                href={item.href}
                className={
                  isActive(item.href)
                    ? "block rounded-[10px] bg-primary-soft px-3.5 py-[7px] text-primary"
                    : "block rounded-[10px] px-3.5 py-[7px] text-text-1 transition-colors hover:bg-[rgba(29,79,216,.07)] hover:text-primary"
                }
              >
                {item.label}
              </Link>
              {item.children && (
                <div className="invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition-all duration-[180ms] group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  <div
                    className="glass-strong min-w-[168px] rounded-2xl p-1.5 [animation:riseIn_180ms_var(--ease-out)_both]"
                    style={{ background: "rgba(255,255,255,.9)" }}
                  >
                    {item.children.map((c) => (
                      <Link
                        key={c.href + c.label}
                        href={c.href}
                        className="block rounded-[10px] px-3 py-2 text-[13px] font-semibold text-text-1 transition-colors hover:bg-[rgba(29,79,216,.08)] hover:text-primary"
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="flex-1" />

        {/* 데스크탑 검색 — P2-14 인라인 자동완성 (HeaderSearch) */}
        <HeaderSearch />

        {/* 데스크탑 알림 진입점 (P2-3) — 모바일 🔔과 동일 타깃 */}
        <Link
          href="/notifications"
          aria-label="알림"
          className="hidden h-9 w-9 items-center justify-center rounded-xl bg-[rgba(255,255,255,.7)] text-[15px] text-text-1 transition-colors hover:text-primary md:flex"
        >
          🔔
        </Link>

        {/* 화면당 primary CTA는 1개 — 노트 쓰기 */}
        <Link
          href="/notes/new"
          className="btn-primary btn-cta hidden px-4 py-[9px] text-[13px] md:block"
        >
          노트 쓰기
        </Link>

        {/* 세션 영역 — 로그인 시 아바타+플랜 배지+드롭다운 / 비로그인 시 로그인 링크 */}
        <HeaderAuth />

        {/* 모바일 아이콘 + 전체 메뉴(☰) */}
        <div className="flex items-center gap-3.5 text-base text-text-1 md:hidden">
          <Link href="/search" aria-label="검색">⌕</Link>
          <Link href="/notifications" aria-label="알림">🔔</Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
