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
      {banner.ctaLabel ? (
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

function HouseAdCard({ ad }: { ad: HouseAd }) {
  return (
    <AdSlotTracker creativeId={ad.id} kind="house">
      <Link
        href={ad.href}
        className="block rounded-2xl border border-line bg-surface px-5 py-4 no-underline"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-primary">{ad.eyebrow}</span>
          <span className="rounded border border-line px-1 py-px text-[9px] font-semibold text-text-3">
            누구집 안내
          </span>
        </div>
        <div className="mt-1 text-[14.5px] font-extrabold text-ink">{ad.title}</div>
        <p className="mt-1 text-[12px] leading-relaxed text-text-2">{ad.body}</p>
        <span className="mt-2 inline-block text-[12px] font-bold text-primary">
          {ad.ctaLabel} →
        </span>
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
