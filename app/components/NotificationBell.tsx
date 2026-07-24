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

  const cls =
    variant === "desktop"
      ? "press relative hidden h-9 w-9 items-center justify-center rounded-xl bg-[rgba(255,255,255,.7)] text-text-1 transition-colors hover:text-primary md:flex"
      : "press relative flex h-8 w-8 items-center justify-center";
  const size = variant === "desktop" ? 18 : 19;

  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `알림 ${count}건` : "알림"}
      className={cls}
    >
      <Icon name="bell" size={size} />
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[#e5484d] px-1 text-[9px] font-extrabold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
