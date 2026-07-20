"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* S13-13a 헤더 세션 영역 — /api/auth/session 지연 조회 (정적 셸 ISR 유지)
   로그인: 이니셜 원형 아바타 + 플랜 배지(✦, 시안 9m 4373행) + 드롭다운
   비로그인: "로그인" 텍스트 링크 → /login */

type SessionUser = {
  name?: string | null;
  email?: string | null;
  plan?: string | null;
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
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) {
          if (!cancelled) setState({ status: "guest" });
          return;
        }
        const s = (await res.json().catch(() => null)) as {
          user?: SessionUser;
        } | null;
        if (cancelled) return;
        if (s?.user?.email) setState({ status: "user", user: s.user });
        else setState({ status: "guest" });
      } catch {
        if (!cancelled) setState({ status: "guest" });
      }
    })();
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
    return (
      <Link
        href="/login"
        className="whitespace-nowrap text-[13px] font-bold text-text-1 transition-colors hover:text-primary"
      >
        로그인
      </Link>
    );
  }

  const { user } = state;
  const initial = (user.name?.trim() || user.email || "누")
    .charAt(0)
    .toUpperCase();
  const planBadge = user.plan ? PLAN_BADGE[user.plan] : undefined;

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="내 계정 메뉴"
        className="flex items-center gap-1.5"
      >
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef] text-[13px] font-extrabold text-primary">
          {initial}
        </span>
        {planBadge && (
          <span
            className="hidden rounded-full px-2 py-[3px] text-[10px] font-extrabold text-[#7ea2ff] md:inline-block"
            style={{ background: "rgba(25,31,40,.94)" }}
          >
            {planBadge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 pt-2">
          <div
            className="glass-strong min-w-[168px] rounded-2xl p-1.5 [animation:riseIn_180ms_var(--ease-out)_both]"
            style={{ background: "rgba(255,255,255,.94)" }}
            role="menu"
          >
            <div className="truncate px-3 pb-1 pt-2 text-[11px] text-text-3">
              {user.name?.trim() || user.email}
            </div>
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
