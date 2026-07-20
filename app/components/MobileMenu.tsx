"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { NAV } from "./nav-data";

/** 모바일 전체 메뉴 — ☰ 트리거 + 우측 슬라이드 글래스 시트 (md:hidden)
 *  GNB 4 대분류(nav-data.ts 공유)를 하위 메뉴까지 노출해 데스크탑 네비와 동기화.
 *  닫힘: 배경 탭 · ✕ · 라우트 변경(usePathname). 열림 동안 body 스크롤 잠금. */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 라우트 변경 시 자동 닫힘
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 열림 동안 body 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <button
        type="button"
        aria-label="전체 메뉴 열기"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-xl text-lg text-text-1 transition-colors active:bg-[rgba(29,79,216,.08)] md:hidden"
      >
        ☰
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="전체 메뉴">
          {/* 배경 오버레이 — 탭하면 닫힘 */}
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default"
            style={{ background: "rgba(20,26,38,.4)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
          />

          {/* 우측 슬라이드 패널 */}
          <div
            className="glass-strong absolute right-0 top-0 flex h-full w-[82%] max-w-[340px] flex-col overflow-y-auto rounded-l-3xl [animation:riseIn_220ms_var(--ease-out)_both]"
            style={{
              background: "rgba(255,255,255,.94)",
              paddingTop: "max(16px, env(safe-area-inset-top, 0px))",
              paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-1">
              <span className="text-[15px] font-extrabold text-ink">전체 메뉴</span>
              <button
                type="button"
                aria-label="메뉴 닫기"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-base text-text-2 transition-colors active:bg-[rgba(29,79,216,.08)]"
              >
                ✕
              </button>
            </div>

            {/* 4 대분류 + 하위 메뉴 */}
            <nav className="flex flex-1 flex-col gap-4 px-4 pt-1">
              {NAV.map((item) => (
                <div key={item.label}>
                  <Link
                    href={item.href}
                    className={
                      isActive(item.href)
                        ? "block rounded-xl bg-primary-soft px-3 py-2 text-[15px] font-extrabold text-primary"
                        : "block rounded-xl px-3 py-2 text-[15px] font-extrabold text-ink transition-colors active:bg-[rgba(29,79,216,.07)]"
                    }
                  >
                    {item.label}
                  </Link>
                  {item.children && (
                    <div className="mt-0.5 flex flex-col">
                      {item.children.map((c) => (
                        <Link
                          key={c.href + c.label}
                          href={c.href}
                          className="rounded-[10px] px-3 py-[9px] pl-5 text-[13px] font-semibold text-text-2 transition-colors active:bg-[rgba(29,79,216,.08)] active:text-primary"
                        >
                          {c.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>

            {/* 하단 — 로그인/마이 + primary CTA */}
            <div className="mt-4 flex flex-col gap-2 border-t border-[#eef1f6] px-4 pt-3">
              <div className="flex gap-2">
                <Link
                  href="/login"
                  className="glass flex-1 rounded-xl py-2.5 text-center text-[13px] font-bold text-text-1"
                >
                  로그인
                </Link>
                <Link
                  href="/my"
                  className="glass flex-1 rounded-xl py-2.5 text-center text-[13px] font-bold text-text-1"
                >
                  마이페이지
                </Link>
              </div>
              <Link
                href="/notes/new"
                className="btn-primary rounded-xl py-3 text-center text-sm"
              >
                노트 쓰기
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
