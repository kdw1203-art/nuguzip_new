"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSessionLite } from "@/lib/client/session-lite";

/* S13-13a 헤더 세션 영역 — /api/auth/session 지연 조회 (정적 셸 ISR 유지)
   로그인: 이니셜 원형 아바타 + 플랜 배지(✦, 시안 9m 4373행) + 드롭다운
   비로그인: "로그인" 텍스트 링크 → /login */

type SessionUser = {
  name?: string | null;
  email?: string | null;
  plan?: string | null;
  /* 세션 콜백(auth.ts)이 role 을 싣는다 — 관리자에게만 콘솔 링크를 그린다 */
  role?: string | null;
};

type AuthState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "user"; user: SessionUser };

const PLAN_BADGE: Record<string, string> = {
  pro: "✦ 플러스",
  expert: "✦ 전문가",
  enterprise: "✦ 엔터프라이즈",
};

const MENU = [
  { label: "마이", href: "/my" },
  { label: "내 매물", href: "/my/listings" },
  { label: "포인트 지갑", href: "/my/points" },
  { label: "크리에이터", href: "/my/creator" },
  { label: "구독 관리", href: "/subscription" },
  { label: "설정", href: "/my/settings" },
  { label: "고객센터", href: "/support" },
] as const;

export function HeaderAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 최적화 26 — 공유 세션 조회(페이지당 1회)로 수렴
    getSessionLite().then((s) => {
      if (cancelled) return;
      if (s?.user?.email) setState({ status: "user", user: s.user });
      else setState({ status: "guest" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 바깥 클릭으로 드롭다운 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (state.status === "loading") {
    return <span className="inline-block w-[30px]" aria-hidden />;
  }

  if (state.status === "guest") {
    /* 웹5 — CTA 위계 정리. 회원가입이 아웃라인 필이라 헤더의 진짜 목표
       행동("노트 쓰기" 파랑 버튼)과 경쟁했다. 이 제품의 첫 행동은 가입이
       아니라 기록이다(로그인 없이 작성, 저장할 때 로그인) — 회원가입은
       로그인과 같은 텍스트 링크로 내려 시선 경쟁을 없앤다. */
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="whitespace-nowrap text-[13px] font-bold text-text-1 transition-colors hover:text-primary"
        >
          로그인
        </Link>
        <Link
          href="/signup"
          className="hidden whitespace-nowrap text-[13px] font-bold text-text-2 transition-colors hover:text-primary md:inline"
        >
          회원가입
        </Link>
      </div>
    );
  }

  const { user } = state;
  const initial = (user.name?.trim() || user.email || "누")
    .charAt(0)
    .toUpperCase();
  /* 관리자는 플랜 대신 "관리자"로 표기 — 운영 계정임이 배지에서 바로 보이게. */
  const planBadge =
    user.role === "admin" ? "✦ 관리자" : user.plan ? PLAN_BADGE[user.plan] : undefined;

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="내 계정 메뉴"
        className="flex items-center"
      >
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef] text-[13px] font-extrabold text-primary">
          {initial}
        </span>
      </button>
      {/* 웹2 — 플랜 배지를 드롭다운 토글에서 분리해 링크로. 유료·관리자 배지는
          이미 있었지만 무료 사용자에게는 아무것도 없어 업그레이드 진입점이
          드롭다운 두 단계 아래(구독 관리)에만 있었다. 무료는 "무료" 배지가
          /subscription 으로 바로 간다. 모바일 헤더는 폭이 좁아 종전대로 md+ 만. */}
      {planBadge ? (
        <Link
          href={user.role === "admin" ? "/admin" : "/subscription"}
          className="hidden rounded-full px-2 py-[3px] text-[10px] font-extrabold text-[#7ea2ff] no-underline md:inline-block"
          style={{ background: "rgba(25,31,40,.94)" }}
        >
          {planBadge}
        </Link>
      ) : (
        <Link
          href="/subscription"
          title="플랜 비교·업그레이드"
          className="hidden rounded-full border border-[#d7dee8] px-2 py-[3px] text-[10px] font-extrabold text-text-3 no-underline transition-colors hover:border-primary hover:text-primary md:inline-block"
        >
          무료
        </Link>
      )}

      {open && (
        <div className="absolute right-0 top-full z-50 pt-2">
          <div
            className="glass-strong min-w-[168px] rounded-2xl p-1.5 [animation:riseIn_180ms_var(--ease-out)_backwards]"
            style={{ background: "rgba(255,255,255,.94)" }}
            role="menu"
          >
            <div className="truncate px-3 pb-1 pt-2 text-[11px] text-text-3">
              {user.name?.trim() || user.email}
            </div>
            {/* 관리자 콘솔 진입점 — 이 링크가 없어 관리자가 /admin 존재를
                모르는 상태였다(2026-08-02). 접근 제어는 서버 레이아웃이 한다. */}
            {user.role === "admin" && (
              <Link
                href="/admin"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-[10px] px-3 py-2 text-[13px] font-extrabold text-primary transition-colors hover:bg-[rgba(29,79,216,.08)]"
              >
                관리자 콘솔
              </Link>
            )}
            {MENU.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-[10px] px-3 py-2 text-[13px] font-semibold text-text-1 transition-colors hover:bg-[rgba(29,79,216,.08)] hover:text-primary"
              >
                {m.label}
              </Link>
            ))}
            <div className="mx-2 my-1 border-t border-line" />
            {/* 라우트 핸들러(로그아웃)라서 <Link> 프리페치 대상이 아니다.
                프리페치되면 마우스만 올려도 로그아웃될 수 있어 <a> 가 맞다. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/auth/signout"
              role="menuitem"
              className="block rounded-[10px] px-3 py-2 text-[13px] font-semibold text-danger transition-colors hover:bg-danger-soft"
            >
              로그아웃
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
