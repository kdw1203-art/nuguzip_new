"use client";

import { useCallback, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import {
  TOWN_CATEGORY_LINKS,
  type TownCategoryLink,
} from "@/lib/town/category-links";

/**
 * 동네이야기 카테고리 바로가기 — 인터랙티브.
 * 카드를 누르면 설명이 접히며 세로로 살짝 줄어드는 "고정(pinned)" 애니메이션이
 * 재생된 뒤 해당 카테고리로 이동한다. 현재 경로와 일치하는 카드는 고정 상태로 표시.
 *
 * `stick` — 하위 카테고리 페이지에서 쓰는 모드. 헤더(스크롤 시 56px) 바로 아래에
 * 붙여 스크롤해도 카테고리 줄이 사라지지 않게 한다. 랜딩(`/town`)은 목록 자체가
 * 히어로 역할이라 고정하지 않는다.
 */

type Item = TownCategoryLink;

const NAV_DELAY_MS = 170; // 축소·고정 애니메이션을 보여준 뒤 이동

export function TownCategoryNav({
  items = TOWN_CATEGORY_LINKS,
  stick = false,
}: {
  items?: Item[];
  stick?: boolean;
}) {
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
    <div
      /* 모바일 실측 11 — 스크롤바를 숨겨 두어 "더 있다"는 힌트가 우연히 잘린
         카드뿐이었다. 우측 가장자리 페이드(mask)로 이어짐을 암시한다(md+ 는
         전체가 보이므로 불필요 — 해제). */
      className={`rise-in mb-5 flex w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] md:[mask-image:none] ${
        stick
          ? /* 헤더는 sticky top-0 이고 스크롤 시 높이가 56px(패딩 8 + h-12)로 줄어든다.
               그 아래에 붙이고 z-40(헤더 z-50 미만)으로 두어 헤더가 항상 위에 오게 한다.
               좌우 -mx/px 는 컨테이너 패딩을 넘어 배경을 끝까지 채우기 위한 것. */
            "sticky top-[56px] z-40 -mx-5 bg-bg px-5 pt-2"
          : ""
      }`}
    >
      {items.map((l) => {
        const pinned = pending === l.href || activeHref === l.href;
        return (
          <button
            key={l.href}
            type="button"
            onClick={() => go(l.href)}
            aria-current={pinned ? "page" : undefined}
            aria-label={`${l.label} — ${l.desc}`}
            title={`${l.label} — ${l.desc}`}
            /* 제안 모바일2(2026-08-03) — 카드 축소: 모바일 92×76px(기존 104×92).
               md+ 는 가로 균등 분배 유지. */
            className={`press relative flex w-[92px] shrink-0 flex-col items-center justify-center rounded-2xl border px-2 text-center transition-all duration-300 ease-out md:w-auto md:min-w-0 md:flex-1 md:basis-0 ${
              pinned
                ? "h-[64px] border-primary bg-primary-soft shadow-[0_6px_18px_rgba(29,79,216,.18)] md:h-[72px]"
                : "card tile h-[76px] border-transparent md:h-[92px]"
            }`}
          >
            {/* 아이콘 칩 — 9칸이 전부 같은 잉크색이라 목록이 평평했다.
                성격별 색을 입혀 스캔이 되게 한다. */}
            <span
              className={`tile-ico flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors ${
                pinned ? "bg-primary text-surface" : l.tone
              }`}
            >
              <Icon name={l.icon} size={pinned ? 16 : 17} />
            </span>
            <span
              className={`mt-1.5 w-full truncate t-sub font-extrabold transition-colors ${
                pinned ? "text-primary" : "text-ink"
              }`}
            >
              {l.label}
            </span>
            {/* 고정 시 설명이 접히며 카드가 세로로 살짝 줄어든다 */}
            <span
              className={`w-full truncate t-caption text-text-3 transition-all duration-300 ease-out ${
                pinned ? "mt-0 max-h-0 opacity-0" : "mt-0.5 max-h-4 opacity-100"
              }`}
            >
              {l.desc}
            </span>
            {pinned ? (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
