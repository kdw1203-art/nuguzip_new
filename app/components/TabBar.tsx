"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Icon } from "./Icon";

/** 균형 5슬롯(2-＋-2) — ＋가 정중앙에 오도록 재배치(2026-07-21 리디자인).
 *  홈·지도·기록(＋)·동네·마이. 통일 라인 아이콘 사용. */
const TABS = [
  { label: "홈", icon: "house", href: "/" },
  { label: "지도", icon: "map", href: "/map" },
  // 중앙 ＋는 핵심 전환 동선 '노트 쓰기'(/notes/new) 고정
  { label: "기록", icon: "plus", href: "/notes/new", center: true },
  { label: "동네", icon: "messages-square", href: "/town" },
  { label: "마이", icon: "user", href: "/my" },
];

/** 모바일 하단 플로팅 글래스 탭바 — 중앙 정렬·균형 5슬롯.
 *
 * 모바일 실측 4(2026-08-02): 중앙 기록(+) 원이 스크롤 중에도 본문 위에 떠
 * 콘텐츠를 가렸다. 아래로 읽어 내려가는 동안(=콘텐츠 소비 중)은 바를 살짝
 * 내리고 반투명하게 접고, 위로 스크롤(=이동 의도)하면 즉시 복원한다. */
export function TabBar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const [compact, setCompact] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);
  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY.current;
        /* 미세 떨림(관성 스크롤 끝)에 반응하지 않도록 8px 이상만 판정 */
        if (dy > 8 && y > 160) setCompact(true);
        else if (dy < -8 || y <= 160) setCompact(false);
        lastY.current = y;
        ticking.current = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`tabbar-autohide fixed left-1/2 z-50 w-[min(420px,calc(100%-28px))] -translate-x-1/2 transition-all duration-300 md:hidden ${
        compact ? "translate-y-[14px] opacity-85" : ""
      }`}
      style={{ bottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}
      aria-label="하단 내비게이션"
    >
      <div className="glass-strong grid grid-cols-5 items-end rounded-[26px] px-2 pb-2 pt-2 shadow-[0_12px_32px_rgba(15,23,42,.18)]">
        {TABS.map((tab) =>
          tab.center ? (
            <Link
              key={tab.label}
              href={tab.href}
              aria-label={tab.label}
              className="flex flex-col items-center"
            >
              <span
                className={`press -mt-6 mb-[3px] flex h-[52px] w-[52px] items-center justify-center rounded-full leading-none text-white transition-transform duration-300 ${
                  compact ? "scale-[.82]" : ""
                }`}
                style={{
                  background: "linear-gradient(135deg,#4573f5 0%,#1d4fd8 100%)",
                  boxShadow: "0 8px 22px rgba(29,79,216,.42)",
                }}
              >
                <Icon name={tab.icon} size={26} strokeWidth={2.2} />
              </span>
              <span className="text-[10px] font-extrabold text-primary">
                {tab.label}
              </span>
            </Link>
          ) : (
            <Link
              key={tab.label}
              href={tab.href}
              aria-current={isActive(tab.href) ? "page" : undefined}
              className={`relative flex flex-col items-center gap-[3px] py-1.5 transition-colors ${
                isActive(tab.href) ? "text-primary" : "text-text-3"
              }`}
            >
              <span
                className={`absolute top-0 h-[3px] w-[3px] rounded-full bg-primary transition-opacity ${
                  isActive(tab.href) ? "opacity-100" : "opacity-0"
                }`}
              />
              <span
                className={`flex leading-none transition-transform duration-200 ${
                  isActive(tab.href) ? "scale-110" : ""
                }`}
              >
                <Icon name={tab.icon} size={22} />
              </span>
              <span
                className={`text-[10px] leading-none ${
                  isActive(tab.href) ? "font-bold" : "font-semibold"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}
