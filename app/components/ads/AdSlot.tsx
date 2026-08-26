import Link from "next/link";
import type { ReactNode } from "react";
import { listBanners, type Banner, type BannerPlacement } from "@/lib/admin/banners";
import { pickHouseAd, type HouseAd } from "@/lib/ads/house-ads";
import type { AdPlacement } from "@/lib/ads/adsense-policy";
import { isAdFreePlan } from "@/lib/ads/ad-free";
import { AdSlotTracker } from "./AdSlotTracker";
import { AdFreeGate } from "./AdFreeGate";

/**
 * H3·H4 — 광고 슬롯 (서버 컴포넌트).
 *
 * 우선순위: 어드민이 등록한 배너(banners 테이블) → 하우스 광고 → 아무것도 안 그림.
 * AdSense 는 layout 의 Auto ads 가 따로 처리하므로 여기서 다루지 않는다.
 *
 * 광고 없는 플랜(pro/expert/enterprise)에는 하우스 광고도 띄우지 않는다.
 * 하우스 광고는 대부분 업셀인데, 이미 결제한 사람에게 결제를 권하는 건 소음이다.
 *
 * 등록된 배너도 하우스 광고도 없으면 자리를 차지하지 않는다.
 * "광고 준비 중" 같은 빈 상자를 남기지 않는다 — 빈 상자는 레이아웃만 밀고 정보가 없다.
 */

const PLACEMENT_MAP: Record<AdPlacement, BannerPlacement> = {
  home_feed: "home",
  community_feed: "community",
  report_free_body: "global",
};

function BannerCard({ banner }: { banner: Banner }) {
  const href = banner.ctaUrl || null;
  const inner = (
    <div
      className="flex flex-col gap-1 rounded-2xl px-5 py-4"
      style={{
        background: `linear-gradient(135deg, ${banner.bgFrom}, ${banner.bgTo})`,
        color: banner.textColor || "white",
      }}
    >
      <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">광고</span>
      <span className="text-[15px] font-extrabold leading-snug">{banner.title}</span>
      {banner.subtitle ? (
        <span className="text-[12px] leading-relaxed opacity-90">{banner.subtitle}</span>
      ) : null}
      {/* ctaLabel 과 ctaUrl 은 서로 독립인 nullable 컬럼이고, 어드민 폼은 빈 URL 을
          null 로 저장한다. 예전에는 라벨만 있으면 무조건 그렸기 때문에, URL 없는
          배너에서 굵은 밑줄 텍스트가 링크처럼 보이는데 감싸는 <a> 가 없어 눌러도
          아무 일도 없었다. 갈 곳이 있을 때만 CTA 를 그린다. */}
      {banner.ctaLabel && href ? (
        <span className="mt-1.5 text-[12px] font-bold underline underline-offset-2">
          {banner.ctaLabel}
        </span>
      ) : null}
    </div>
  );

  if (!href) return <div className="block">{inner}</div>;

  // 외부 링크는 새 탭 + rel 로 연다 (referrer·opener 유출 방지)
  const external = /^https?:\/\//i.test(href);
  return (
    <AdSlotTracker creativeId={banner.id} kind="banner">
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="block no-underline">
          {inner}
        </a>
      ) : (
        <Link href={href} className="block no-underline">
          {inner}
        </Link>
      )}
    </AdSlotTracker>
  );
}

/**
 * 하우스 광고(누구집 안내) 카드.
 *
 * 디자인: 예전엔 순백(bg-surface) 카드라, 커버 이미지가 있는 임장노트 카드들
 * 사이(동네이야기 피드)에 끼면 "빈 구멍"처럼 튀어 리듬을 깼다(2026-08-15 소유자
 * 캡처). 노트 카드와 같은 "커버 + 본문" 실루엣을 주면 의도된 안내 카드로 읽힌다 —
 * 상단에 브랜드 그라데이션 커버 밴드를 얹고(아이브로·안내칩은 그 위 흰 글자),
 * 본문은 아래에 둔다. 홈 피드(밝은 배경)에서도 자연스럽다.
 */
/** 하우스 광고별 시각 테마 — 색·워터마크 아이콘. 등록 안 된 id 는 기본(브랜드 블루). */
const HOUSE_AD_THEME: Record<string, { from: string; to: string; icon: ReactNode }> = {
  house_map_real_price: {
    from: "#1d4fd8",
    to: "#2fa3e0",
    icon: (
      // 지도 핀 클러스터 — 장식(숫자 없음). 실거래 금액은 지도에서 실데이터로 본다.
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M18 30c-5.5-6-8-9.6-8-13.4C10 11 13.6 8 18 8s8 3 8 8.6c0 3.8-2.5 7.4-8 13.4Z" />
        <circle cx="18" cy="16.4" r="2.6" />
        <path d="M33 22c-3.4-3.7-5-6-5-8.3C28 10.2 30.2 8 33 8s5 2.2 5 5.7c0 2.3-1.6 4.6-5 8.3Z" opacity=".55" />
      </g>
    ),
  },
  house_note_start: {
    from: "#1d4fd8",
    to: "#5b47d8",
    icon: (
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 29V11a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v18l-9-4.5L11 29Z" />
        <path d="M15 14h10M15 18h6" />
      </g>
    ),
  },
  house_subscription: {
    from: "#155e9c",
    to: "#1d4fd8",
    icon: (
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="m20 7 12 6-12 6L8 13l12-6Z" />
        <path d="m8 20 12 6 12-6" opacity=".55" />
        <path d="m8 26 12 6 12-6" opacity=".3" />
      </g>
    ),
  },
  house_expert: {
    from: "#0f766e",
    to: "#1d4fd8",
    icon: (
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="20" cy="14" r="5" />
        <path d="M10 30c1.6-5 5.4-7.5 10-7.5S28.4 25 30 30" />
        <path d="m27 16 2 2 4-4" opacity=".7" />
      </g>
    ),
  },
};

function HouseAdCard({ ad }: { ad: HouseAd }) {
  const theme = HOUSE_AD_THEME[ad.id] ?? { from: "#1d4fd8", to: "#3a63de", icon: null };
  return (
    <AdSlotTracker creativeId={ad.id} kind="house">
      <Link
        href={ad.href}
        className="card group block overflow-hidden rounded-[16px] no-underline transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(29,79,216,.35)] hover:shadow-[0_14px_30px_rgba(16,28,54,.12)]"
      >
        {/* 브랜드 커버 밴드 — 지역 워터마크 아이콘이 호버에 살짝 커진다 */}
        <div
          className="relative flex items-center justify-between overflow-hidden px-4 py-3.5"
          style={{ background: `linear-gradient(120deg, ${theme.from}, ${theme.to})` }}
        >
          {/* 점 패턴 — 순수 장식 */}
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[.14]"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <pattern id={`had-dots-${ad.id}`} width="14" height="14" patternUnits="userSpaceOnUse">
                <circle cx="1.5" cy="1.5" r="1.1" fill="white" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#had-dots-${ad.id})`} />
          </svg>
          {theme.icon && (
            <svg
              aria-hidden
              viewBox="0 0 40 40"
              className="pointer-events-none absolute -bottom-1.5 right-2 h-11 w-11 text-white opacity-25 transition-transform duration-300 group-hover:scale-110 group-hover:opacity-40"
            >
              {theme.icon}
            </svg>
          )}
          <span className="relative text-[11px] font-extrabold tracking-tight text-white">
            {ad.eyebrow}
          </span>
          <span className="relative rounded-[6px] bg-white/20 chip-pad text-[9px] font-bold text-white">
            누구집 안내
          </span>
        </div>
        <div className="flex flex-col gap-1 px-4 pb-3.5 pt-2.5">
          <div className="text-[15px] font-extrabold leading-snug text-ink">{ad.title}</div>
          <p className="text-[13px] leading-relaxed text-text-2">{ad.body}</p>
          <span className="mt-1 inline-flex items-center gap-1 text-[13px] font-bold text-primary">
            {ad.ctaLabel}
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </span>
        </div>
      </Link>
    </AdSlotTracker>
  );
}

export async function AdSlot({
  placement,
  seed = 0,
  adFree = false,
  signedIn = false,
  plan = null,
  className,
}: {
  placement: AdPlacement;
  /** 같은 페이지에 슬롯이 여러 개일 때 서로 다른 배너가 나오도록 하는 위치값 */
  seed?: number;
  /** 광고 제외 플랜(pro/expert/enterprise) 여부 */
  adFree?: boolean;
  signedIn?: boolean;
  /**
   * 보는 사람의 플랜. null 이면 "모른다"는 뜻이다(공유 캐시 페이지 등).
   * 모를 때는 특정 플랜을 겨냥한 배너를 띄우지 않는다 — 이미 결제한 사람에게
   * "지금 결제하세요"가 나가는 것보다 안 나가는 쪽이 낫다.
   */
  plan?: string | null;
  className?: string;
}) {
  // adFree 를 직접 받았거나(동적 페이지 — lib/ads/viewer.ts getAdViewer), plan 이
  // 광고 제거 플랜이면 서버에서부터 아무것도 그리지 않는다.
  if (adFree || isAdFreePlan(plan)) return null;

  const all = await listBanners(PLACEMENT_MAP[placement]).catch(() => [] as Banner[]);
  const banners = all.filter((b) => {
    if (!b.targetPlan) return true;
    if (!plan) return false;
    return b.targetPlan.toLowerCase() === plan.toLowerCase();
  });
  const banner = banners.length > 0 ? banners[seed % banners.length] : null;

  let content: ReactNode = null;
  if (banner) {
    content = (
      <div className={className}>
        <BannerCard banner={banner} />
      </div>
    );
  } else {
    const house = pickHouseAd(placement, seed, { signedIn });
    if (!house) return null;
    content = (
      <div className={className}>
        <HouseAdCard ad={house} />
      </div>
    );
  }

  // plan === null 은 "보는 사람을 모른다"(정적 캐시 페이지) — 캐시를 살리기 위해
  // 광고를 그대로 내려보내되, 클라이언트에서 유료 플랜이면 숨긴다.
  if (plan == null) return <AdFreeGate>{content}</AdFreeGate>;
  return content;
}

export default AdSlot;
