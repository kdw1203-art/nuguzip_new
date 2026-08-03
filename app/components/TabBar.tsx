"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Icon } from "./Icon";
import { useCookieConsent } from "@/components/consent/use-cookie-consent";

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

  /* 모바일6 — 쿠키 배너(결정 전)와 탭바가 하단에 두 층으로 쌓였다(캡처).
     동의는 첫 화면에서 탭 한 번이면 끝나는 결정이라, 결정 전에는 탭바를
     잠시 접어 한 층만 보이게 한다. 결정 즉시(localStorage 반영) 복원. */
  const { state: consentState } = useCookieConsent();

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

  // 모바일6 — 쿠키 결정 전에는 배너 한 층만(훅 뒤 조기 반환).
  if (consentState.status === "undecided") return null;

  return (
    <nav
      className={`tabbar-autohide fixed left-1/2 z-50 w-[min(420px,calc(100%-28px))] -translate-x-1/2 transition-all duration-300 md:hidden ${
        compact ? "translate-y-[14px] opacity-85" : ""
      }`}
      /* 소유자 캡처(2026-08-04): 바가 콘텐츠 버튼을 가렸다 — 더 아래로,
         더 얇게. 바닥 여백 16→6px(safe-area 는 그대로 존중 — 홈 인디케이터
         아래로는 안 내린다). 글씨 11px 은 유지(이전 요청: 메뉴 글씨는 키움). */
      style={{ bottom: "max(6px, env(safe-area-inset-bottom, 0px))" }}
      aria-label="하단 내비게이션"
    >
      <div className="glass-strong grid grid-cols-5 items-end rounded-[22px] px-2 pb-1 pt-1 shadow-[0_12px_32px_rgba(15,23,42,.18)]">
        {TABS.map((tab) =>
          tab.center ? (
            <Link
              key={tab.label}
              href={tab.href}
              aria-label={tab.label}
              className="flex flex-col items-center"
            >
              <span
                /* 52→44px, 돌출 -mt-6→-mt-3.5 — 바 위로 솟는 높이를 줄인다.
                   44px 는 터치 타깃 하한선. */
                className={`press -mt-3.5 mb-[2px] flex h-[44px] w-[44px] items-center justify-center rounded-full leading-none text-white transition-transform duration-300 ${
                  compact ? "scale-[.82]" : ""
                }`}
                style={{
                  background: "linear-gradient(135deg,#4573f5 0%,#1d4fd8 100%)",
                  boxShadow: "0 8px 22px rgba(29,79,216,.42)",
                }}
              >
                <Icon name={tab.icon} size={22} strokeWidth={2.2} />
              </span>
              <span className="text-[11px] font-extrabold text-primary">
                {tab.label}
              </span>
            </Link>
          ) : (
            <Link
              key={tab.label}
              href={tab.href}
              aria-current={isActive(tab.href) ? "page" : undefined}
              className={`relative flex flex-col items-center gap-[2px] py-1 transition-colors ${
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
                <Icon name={tab.icon} size={20} />
              </span>
              <span
                className={`text-[11px] leading-none ${
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
