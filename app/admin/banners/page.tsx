import { listAllBanners, bannerLifecycle } from "@/lib/admin/banners";
import { HOUSE_ADS } from "@/lib/ads/house-ads";
import { BannersClient } from "./BannersClient";

/**
 * H4 — 배너 CMS.
 *
 * banners 테이블의 노출기간·위치·순위·타겟플랜을 여기서 관리한다.
 * 등록된 배너가 없으면 광고 슬롯은 하우스 광고(H3)로 채워지므로,
 * 아래에 지금 어떤 하우스 광고가 대신 나가는지 같이 보여준다.
 * (빈 목록을 보고 "광고가 아무것도 안 나간다"고 오해하지 않도록.)
 */

export const dynamic = "force-dynamic";

export default async function AdminBannersPage() {
  const banners = await listAllBanners().catch(() => []);
  const now = new Date();
  const withState = banners.map((b) => ({ ...b, lifecycle: bannerLifecycle(b, now) }));
  const liveCount = withState.filter((b) => b.lifecycle === "live").length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-[19px] font-extrabold text-[#e8edf6]">배너 · 하우스광고</h1>
        <p className="text-[12.5px] leading-relaxed text-[#9aa6b8]">
          등록 {withState.length}건 · 지금 노출 중 {liveCount}건. 노출 중인 배너가 없는
          위치에는 아래 하우스 광고가 대신 나갑니다.
        </p>
      </header>

      <BannersClient initial={withState} />

      <section className="flex flex-col gap-2 rounded-[20px] border border-[#243049] bg-[#141b2b] p-5">
        <h2 className="text-[14px] font-extrabold text-[#e8edf6]">
          하우스 광고 (배너 없을 때 대체 노출)
        </h2>
        <p className="text-[11.5px] leading-relaxed text-[#8d99ab]">
          코드에 고정된 내부 안내입니다. 외부 광고 계정 없이 나가며, 문구는
          제품에서 확인 가능한 사실만 씁니다. 수정은 lib/ads/house-ads.ts 에서 합니다.
        </p>
        <ul className="mt-1 flex flex-col gap-2">
          {HOUSE_ADS.map((ad) => (
            <li
              key={ad.id}
              className="flex flex-col gap-0.5 rounded-xl border border-[#243049] px-3.5 py-2.5"
            >
              <span className="text-[12.5px] font-bold text-[#dbe3f0]">{ad.title}</span>
              <span className="text-[11px] text-[#8d99ab]">{ad.body}</span>
              <span className="text-[11px] font-semibold text-[#7ea2ff]">
                {ad.ctaLabel} → {ad.href}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
