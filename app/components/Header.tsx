"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Logo } from "./Logo";

/** 9m GNB — 호버 드롭다운(리퀴드 글래스, riseIn 180ms) */
const NAV: {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
}[] = [
  { label: "홈", href: "/" },
  {
    label: "임장노트",
    href: "/notes",
    children: [
      { label: "공개 임장노트", href: "/notes" },
      { label: "노트 쓰기", href: "/notes/new" },
      { label: "다회차 비교", href: "/notes/compare" },
      { label: "발견 피드", href: "/discover" },
    ],
  },
  {
    label: "지도",
    href: "/map",
    children: [
      { label: "지도 탐색", href: "/map" },
      { label: "단지 비교 담기", href: "/analysis/compare" },
      { label: "청약 센터", href: "/apply" },
    ],
  },
  {
    label: "AI 분석",
    href: "/analysis",
    children: [
      { label: "분석 허브", href: "/analysis" },
      { label: "다자 비교", href: "/analysis/compare" },
      { label: "시세 사이클", href: "/analysis/cycle" },
      { label: "AI 제안가", href: "/analysis/price" },
      { label: "계산기", href: "/calculator" },
    ],
  },
  {
    label: "동네이야기",
    href: "/town",
    children: [
      { label: "커뮤니티", href: "/town" },
      { label: "뉴스·자료", href: "/town/news" },
      { label: "마켓", href: "/town/market" },
      { label: "전문가", href: "/town/experts" },
      { label: "임장 모임", href: "/town/groups" },
    ],
  },
];

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
