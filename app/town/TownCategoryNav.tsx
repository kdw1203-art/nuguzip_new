"use client";

import { useCallback, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "@/app/components/Icon";

/**
 * 동네이야기 카테고리 바로가기 — 인터랙티브.
 * 카드를 누르면 설명이 접히며 세로로 살짝 줄어드는 "고정(pinned)" 애니메이션이
 * 재생된 뒤 해당 카테고리로 이동한다. 현재 경로와 일치하는 카드는 고정 상태로 표시.
 */

type Item = { href: string; label: string; icon: string; desc: string };

const NAV_DELAY_MS = 170; // 축소·고정 애니메이션을 보여준 뒤 이동

export function TownCategoryNav({ items }: { items: Item[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState<string | null>(null);

  // 현재 경로와 일치하는 카테고리(있으면 고정 표시). /town(피드)은 제외.
  const activeHref =
    items.find((i) => i.href !== "/town" && pathname.startsWith(i.href))?.href ?? null;

  const go = useCallback(
    (href: string) => {
      if (pending) return;
      setPending(href);
      router.prefetch(href);
      window.setTimeout(() => router.push(href), NAV_DELAY_MS);
    },
    [router, pending],
  );

  return (
    <div className="rise-in mb-5 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((l) => {
        const pinned = pending === l.href || activeHref === l.href;
        return (
          <button
            key={l.href}
            type="button"
            onClick={() => go(l.href)}
            aria-current={pinned ? "page" : undefined}
            aria-label={`${l.label} — ${l.desc}`}
            className={`press relative flex min-w-[118px] shrink-0 flex-col rounded-[16px] border text-left transition-all duration-300 ease-out ${
              pinned
                ? "border-primary bg-primary-soft px-4 py-2.5 shadow-[0_6px_18px_rgba(29,79,216,.18)]"
                : "card card-hover border-transparent px-4 py-3.5"
            }`}
          >
            <span
              className={`leading-none transition-colors ${pinned ? "text-primary" : "text-ink"}`}
            >
              <Icon name={l.icon} size={pinned ? 18 : 20} />
            </span>
            <span
              className={`mt-1 text-[13px] font-extrabold transition-colors ${
                pinned ? "text-primary" : "text-ink"
              }`}
            >
              {l.label}
            </span>
            {/* 고정 시 설명이 접히며 카드가 세로로 살짝 줄어든다 */}
            <span
              className={`overflow-hidden text-[11px] leading-[1.4] text-text-3 transition-all duration-300 ease-out ${
                pinned ? "max-h-0 opacity-0" : "mt-px max-h-6 opacity-100"
              }`}
            >
              {l.desc}
            </span>
            {pinned ? (
              <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-primary" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
