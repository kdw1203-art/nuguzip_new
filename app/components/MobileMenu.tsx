"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { NAV } from "./nav-data";
import { ThemeToggle } from "./ThemeToggle";
import { PushSubscribe } from "@/components/PushSubscribe";
import { Icon } from "./Icon";

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
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
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
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-xl text-text-1 transition-colors active:bg-[rgba(29,79,216,.08)] md:hidden"
      >
        <Icon name="menu" size={20} />
      </button>

      {open && mounted &&
        createPortal(
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="전체 메뉴">
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default"
            style={{ background: "rgba(20,26,38,.4)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
          />

          <div
            className="glass-strong absolute right-0 top-0 flex h-full w-[86%] max-w-[360px] flex-col rounded-l-3xl [animation:riseIn_220ms_var(--ease-out)_both]"
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
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-text-2 transition-colors active:bg-[rgba(29,79,216,.08)]"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2 pt-1">
              {/* 통합 검색 진입 */}
              <Link
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
                            key={c.href + c.label}
                            href={c.href}
                            className="truncate rounded-[10px] px-3 py-[8px] text-[12.5px] font-semibold text-text-2 transition-colors active:bg-[rgba(29,79,216,.08)] active:text-primary"
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
                <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-text-3">
                  서비스
                </div>
                <div className="grid grid-cols-2 gap-x-1">
                  {SERVICE_LINKS.map((l) => (
                    <Link key={l.href + l.label} href={l.href} className={rowClass(l.href)}>
                      <Icon name={l.icon} size={17} />
                      <span className="truncate">{l.label}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* 내 계정 */}
              <div className="mt-5">
                <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-text-3">
                  내 계정
                </div>
                <div className="grid grid-cols-2 gap-x-1">
                  {ACCOUNT_LINKS.map((l) => (
                    <Link key={l.href + l.label} href={l.href} className={rowClass(l.href)}>
                      <Icon name={l.icon} size={17} />
                      <span className="truncate">{l.label}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* 고객지원 */}
              <div className="mt-5">
                <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-text-3">
                  고객지원
                </div>
                <div className="grid grid-cols-2 gap-x-1">
                  {SUPPORT_LINKS.map((l) => (
                    <Link key={l.href + l.label} href={l.href} className={rowClass(l.href)}>
                      <Icon name={l.icon} size={17} />
                      <span className="truncate">{l.label}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* 화면·알림 설정 */}
              <div className="mt-5">
                <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-text-3">
                  화면 · 알림
                </div>
                <div className="grid grid-cols-2 items-center gap-x-1">
                  <ThemeToggle />
                  <PushSubscribe />
                </div>
              </div>
            </div>

            {/* 하단 — 로그인/마이 + primary CTA */}
            <div className="flex flex-col gap-2 border-t border-[#eef1f6] px-4 pt-3">
              <div className="flex gap-2">
                <Link href="/login" className="glass flex-1 rounded-xl py-2.5 text-center text-[13px] font-bold text-text-1">
                  로그인
                </Link>
                <Link href="/my" className="glass flex-1 rounded-xl py-2.5 text-center text-[13px] font-bold text-text-1">
                  마이페이지
                </Link>
              </div>
              <Link href="/notes/new" className="btn-primary rounded-xl py-3 text-center text-sm">
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
