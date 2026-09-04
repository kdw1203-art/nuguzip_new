"use client";

/* B10 — 헤더 알림 벨 + 미읽음 배지. 마운트 시 경량 카운트 조회. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";

export function NotificationBell({ variant }: { variant: "desktop" | "mobile" }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications/unread-count", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { count?: number } | null) => {
        if (!cancelled && j && typeof j.count === "number") setCount(j.count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /* 모바일25 — 홈 화면 아이콘 배지(App Badging API). PWA 설치 사용자의
     앱 아이콘에 미읽음 수를 싣는다. 지원 브라우저(설치된 PWA 한정)에서만
     동작하고 미지원이면 아무 일도 없다 — 폴리필·대체 UI 없음(벨 배지가 이미
     그 역할이다). 값은 위에서 받은 실측 카운트 그대로. */
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (typeof nav.setAppBadge !== "function") return;
    if (count > 0) nav.setAppBadge(count).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [count]);

  const cls =
    variant === "desktop"
      ? "press relative hidden h-9 w-9 items-center justify-center rounded-xl bg-[var(--glass-bg)] text-text-1 transition-colors hover:text-primary md:flex"
      : "press relative flex h-8 w-8 items-center justify-center after:absolute after:-inset-1.5 after:content-['']";
  const size = variant === "desktop" ? 18 : 19;

  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `알림 ${count}건` : "알림"}
      className={cls}
    >
      <Icon name="bell" size={size} />
      {count > 0 && (
        /* [962] 읽지 않은 알림 = 주홍 온점 배지, 처음 뜰 때 파문 한 번(njn-badge) */
        <span className="njn-badge absolute right-0.5 top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold leading-none">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
