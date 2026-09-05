"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { NAV } from "./nav-data";
import { ThemeToggle } from "./ThemeToggle";
import { PushSubscribe } from "@/components/PushSubscribe";
import { Icon } from "./Icon";
import { getSessionLite } from "@/lib/client/session-lite";

/** 모바일 전체 메뉴 — ☰ 트리거 + 우측 슬라이드 글래스 시트 (md:hidden)
 *  GNB 4 대분류 + 서비스·내 계정·고객지원 섹션까지 노출하는 전체 사이트 디렉토리.
 *  닫힘: 배경 탭 · ✕ · 라우트 변경. 열림 동안 body 스크롤 잠금.
 *  오버레이는 createPortal로 document.body에 렌더 — 헤더 글래스의 backdrop-filter가
 *  position:fixed 컨테이닝 블록이 되어 시트 높이가 헤더로 클램프되던 문제를 회피. */

/** 4 대분류 라벨 → 라인 아이콘 이름 */
const CAT_ICON: Record<string, string> = {
  임장노트: "notebook-pen",
  지도: "map",
  "AI 분석": "sparkles",
  동네이야기: "messages-square",
};

type LinkItem = { label: string; href: string; icon: string };

const SERVICE_LINKS: LinkItem[] = [
  { label: "통합 검색", href: "/search", icon: "search" },
  { label: "맞춤 추천", href: "/recommend", icon: "sparkles" },
  { label: "노트 템플릿", href: "/notes/templates", icon: "notebook-pen" },
  { label: "단지 Q&A", href: "/qna", icon: "messages-square" },
  { label: "실매물 보기", href: "/listings", icon: "house" },
  { label: "매물 등록", href: "/listings/new", icon: "square-plus" },
  { label: "공매·경매", href: "/auctions", icon: "gavel" },
  { label: "개발 물건 중개", href: "/dev-deals", icon: "construction" },
  { label: "정비사업", href: "/redevelopment", icon: "building2" },
  { label: "공공 데이터 현황", href: "/data/records", icon: "bar" },
  { label: "포인트 상점", href: "/points/shop", icon: "gift" },
  { label: "중개사 제휴", href: "/partners", icon: "users" },
];

const ACCOUNT_LINKS: LinkItem[] = [
  { label: "마이페이지", href: "/my", icon: "user" },
  { label: "저장 검색", href: "/my/saved-searches", icon: "search" },
  { label: "관심 목록", href: "/my/wishlist", icon: "heart" },
  { label: "포인트 지갑", href: "/my/points", icon: "wallet" },
  { label: "친구 추천", href: "/my/referral", icon: "user-plus" },
  { label: "내 매물", href: "/my/listings", icon: "building" },
  { label: "알림", href: "/notifications", icon: "bell" },
  { label: "구독 관리", href: "/subscription", icon: "crown" },
  { label: "설정", href: "/my/settings", icon: "settings" },
];

const SUPPORT_LINKS: LinkItem[] = [
  { label: "고객센터", href: "/support", icon: "life" },
  { label: "규제·세금 안내", href: "/guides/regulations", icon: "landmark" },
  { label: "계약 가이드", href: "/guides/contract", icon: "file-text" },
  { label: "법적 고지", href: "/legal", icon: "scale" },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  /* 소유자 캡처(2026-08-04) — 로그인했는데 하단에 "로그인" 버튼이 그대로.
     하단 버튼이 세션과 무관한 하드코딩이었다. HeaderAuth 와 같은 경량 세션
     조회로 상태를 반영한다(판정 전 null 동안은 중립 렌더 — 틀린 버튼을
     먼저 보여주지 않는다). */
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  /* [966] ☰ → 시트를 aria-controls 로 잇는다(포털이라 DOM 상 떨어져 있어도 id 로 연결) */
  const sheetId = useId();
  /* pointerdown 즉시 열기의 레이스 방어 — 여는 손가락을 떼는 순간의 click 이
     방금 나타난 딤 배경에 떨어져 "열리자마자 닫히는" 문제(로컬 재현 확인).
     열림 직후 350ms 동안은 배경 닫기를 무시한다(✕ 버튼·ESC 는 가드 없음). */
  const openedAtRef = useRef(0);
  const pathname = usePathname();

  const openMenu = () => {
    openedAtRef.current = Date.now();
    setOpen(true);
  };
  const closeFromBackdrop = () => {
    if (Date.now() - openedAtRef.current < 350) return;
    setOpen(false);
  };

  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    // 최적화 26 — 공유 세션 조회로 수렴(HeaderAuth 와 같은 요청 재사용)
    getSessionLite().then((s) => {
      if (!cancelled) setLoggedIn(Boolean(s?.user?.email));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* 항목 48 — 모바일 주 내비게이션인데 ESC·포커스 이동·복원이 전부 없었다.
     열리면 패널로 포커스를 옮기고, ESC 로 닫으며, 닫히면 연 버튼으로 되돌린다.
     (Tab 순환까지 필요한 다른 다이얼로그는 ui/Modal 이 담당 — 이 메뉴는 링크
     목록이라 순환보다 ESC·복원이 실질이다.) */
  useEffect(() => {
    if (!open) return;
    const restoreTo =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreTo?.focus?.();
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const rowClass = (href: string) =>
    isActive(href)
      ? "flex items-center gap-2.5 rounded-[10px] bg-primary-soft px-3 py-[9px] text-[13px] font-bold text-primary"
      : "flex items-center gap-2.5 rounded-[10px] px-3 py-[9px] text-[13px] font-semibold text-text-2 transition-colors active:bg-[rgba(29,79,216,.08)] active:text-primary";

  return (
    <>
      <button
        type="button"
        aria-label="전체 메뉴 열기"
        aria-expanded={open}
        aria-controls={sheetId}
        onPointerDown={openMenu}
        onClick={openMenu}
        className="relative flex h-8 w-8 items-center justify-center rounded-xl text-text-1 transition-colors after:absolute after:-inset-1.5 after:content-[''] active:bg-[rgba(29,79,216,.08)] md:hidden"
      >
        <Icon name="menu" size={20} />
      </button>

      {/* 소유자 캡처(2026-08-18) — "열고 닫는 게 너무 느리다". 원인은 렌더 비용:
          시트 전체(링크 45개 + PushSubscribe 의 서비스워커 조회)가 **열 때마다
          마운트**되고 닫을 때 통째로 언마운트됐다. 한 번만 마운트해 두고
          transform/opacity 만 전환한다 — 열기는 즉시(트리거도 pointerdown),
          닫기는 200ms 슬라이드로 대칭. 닫힌 동안은 inert+invisible 로 포커스·
          보조기술에서 제외(visibility 는 전환이 끝난 뒤 꺼진다). */}
      {mounted &&
        createPortal(
        <div
          id={sheetId}
          role="dialog"
          aria-modal="true"
          aria-label="전체 메뉴"
          aria-hidden={!open}
          inert={!open}
          className={`fixed inset-0 z-[60] md:hidden ${
            open ? "visible" : "invisible [transition:visibility_0s_linear_220ms]"
          }`}
        >
          {/* 배경 딤 — blur 없는 순수 딤(2026-08-04 결정 유지) + pointerdown 즉시 닫기 */}
          <button
            type="button"
            aria-label="메뉴 닫기"
            onPointerDown={closeFromBackdrop}
            onClick={closeFromBackdrop}
            className={`absolute inset-0 h-full w-full cursor-default transition-opacity duration-200 ${
              open ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            style={{ background: "rgba(20,26,38,.45)" }}
          />

          <div
            ref={panelRef}
            tabIndex={-1}
            /* glass-strong(backdrop-filter) 제거 — 패널 배경이 불투명 surface 라
               블러는 보이지 않으면서 비용만 냈다. 그림자로 대체.
               전환은 transform 만(합성기 전용) — 레이아웃·페인트 비용 0. */
            className={`absolute right-0 top-0 flex h-full w-[86%] max-w-[360px] transform-gpu flex-col rounded-l-3xl outline-none shadow-[-16px_0_44px_rgba(15,23,42,.22)] transition-transform duration-200 [transition-timing-function:var(--ease-out)] ${
              open ? "translate-x-0" : "translate-x-full"
            }`}
            style={{
              background: "var(--surface)",
              paddingTop: "max(16px, env(safe-area-inset-top, 0px))",
              paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-1">
              <span className="text-[15px] font-extrabold text-ink">전체 메뉴</span>
              <button
                type="button"
                aria-label="메뉴 닫기"
                onPointerDown={() => setOpen(false)}
                onClick={() => setOpen(false)}
                className="relative flex h-8 w-8 items-center justify-center rounded-xl text-text-2 transition-colors after:absolute after:-inset-1.5 after:content-[''] active:bg-[rgba(29,79,216,.08)]"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2 pt-1">
              {/* 통합 검색 진입 */}
              <Link
                    prefetch={false}
                href="/search"
                className="mb-3 flex items-center gap-2 rounded-xl bg-[rgba(127,140,158,.08)] px-3.5 py-2.5 text-[13px] text-text-3 ring-1 ring-line"
              >
                <Icon name="search" size={16} />
                지역·단지·매물 검색
              </Link>

              {/* 4 대분류 + 하위 메뉴 */}
              <nav className="flex flex-col gap-3.5">
                {NAV.map((item) => (
                  <div key={item.label}>
                    <Link
                    prefetch={false}
                      href={item.href}
                      className={
                        isActive(item.href)
                          ? "flex items-center gap-2 rounded-xl bg-primary-soft px-3 py-2 text-[15px] font-extrabold text-primary"
                          : "flex items-center gap-2 rounded-xl px-3 py-2 text-[15px] font-extrabold text-ink transition-colors active:bg-[rgba(29,79,216,.07)]"
                      }
                    >
                      <Icon name={CAT_ICON[item.label] ?? "search"} size={18} />
                      {item.label}
                    </Link>
                    {item.children && (
                      <div className="mt-0.5 grid grid-cols-2 gap-x-1">
                        {item.children.map((c) => (
                          <Link
                    prefetch={false}
                            key={c.href + c.label}
                            href={c.href}
                            className="truncate rounded-[10px] px-3 py-[8px] t-body font-semibold text-text-2 transition-colors active:bg-[rgba(29,79,216,.08)] active:text-primary"
                          >
                            {c.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </nav>

              {/* 서비스 */}
              <div className="mt-5">
                <div className="mb-1 px-1 text-[12px] font-bold uppercase tracking-wide text-text-3">
                  서비스
                </div>
                <div className="grid grid-cols-2 gap-x-1">
                  {SERVICE_LINKS.map((l) => (
                    <Link prefetch={false} key={l.href + l.label} href={l.href} className={rowClass(l.href)}>
                      <Icon name={l.icon} size={17} />
                      <span className="truncate">{l.label}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* 내 계정 */}
              <div className="mt-5">
                <div className="mb-1 px-1 text-[12px] font-bold uppercase tracking-wide text-text-3">
                  내 계정
                </div>
                <div className="grid grid-cols-2 gap-x-1">
                  {ACCOUNT_LINKS.map((l) => (
                    <Link prefetch={false} key={l.href + l.label} href={l.href} className={rowClass(l.href)}>
                      <Icon name={l.icon} size={17} />
                      <span className="truncate">{l.label}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* 고객지원 */}
              <div className="mt-5">
                <div className="mb-1 px-1 text-[12px] font-bold uppercase tracking-wide text-text-3">
                  고객지원
                </div>
                <div className="grid grid-cols-2 gap-x-1">
                  {SUPPORT_LINKS.map((l) => (
                    <Link prefetch={false} key={l.href + l.label} href={l.href} className={rowClass(l.href)}>
                      <Icon name={l.icon} size={17} />
                      <span className="truncate">{l.label}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* 화면·알림 설정 */}
              <div className="mt-5">
                <div className="mb-1 px-1 text-[12px] font-bold uppercase tracking-wide text-text-3">
                  화면 · 알림
                </div>
                <div className="grid grid-cols-2 items-center gap-x-1">
                  <ThemeToggle />
                  <PushSubscribe />
                </div>
              </div>
            </div>

            {/* 하단 — 세션 상태 반영 + primary CTA.
                판정 전(null)에는 마이페이지만(중립) — 틀린 로그인 버튼을 먼저
                보여주지 않는다. */}
            <div className="flex flex-col gap-2 border-t border-line px-4 pt-3">
              <div className="flex gap-2">
                {loggedIn === false && (
                  <Link prefetch={false} href="/login" className="glass flex-1 rounded-xl py-2.5 text-center text-[13px] font-bold text-text-1">
                    로그인
                  </Link>
                )}
                <Link prefetch={false} href="/my" className="glass flex-1 rounded-xl py-2.5 text-center text-[13px] font-bold text-text-1">
                  마이페이지
                </Link>
                {loggedIn === true && (
                  /* [965] /logout 화면 — 프리페치되면 안 되므로 <a> (HeaderAuth 와 동일 사유) */
                  <a href="/logout" className="glass flex-1 rounded-xl py-2.5 text-center text-[13px] font-bold text-text-2">
                    로그아웃
                  </a>
                )}
              </div>
              <Link prefetch={false} href="/notes/new" className="btn-primary rounded-xl py-3 text-center t-body font-bold">
                임장노트 쓰기
              </Link>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
