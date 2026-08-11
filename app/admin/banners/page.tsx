import { listAllBanners, bannerLifecycle } from "@/lib/admin/banners";
import { HOUSE_ADS } from "@/lib/ads/house-ads";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";
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
  /* 2026-07-26: `.catch(() => [])` 였다. 조회가 실패하면 "등록 0건"으로 보이고,
     관리자가 이미 있는 배너를 다시 만들거나 "광고가 안 나간다"고 오판한다.
     실패는 실패라고 말한다 — 편집 UI 도 띄우지 않는다(빈 목록 위에서 저장하면
     기존 배너를 덮어쓸 위험이 있다). */
  const loaded = await listAllBanners().then(
    (banners) => ({ ok: true as const, banners }),
    (err: unknown) => {
      logger.error("[admin/banners] 배너 목록 조회 실패", err);
      return {
        ok: false as const,
        cause: err instanceof Error ? err.message : String(err),
      };
    },
  );

  if (!loaded.ok) {
    return (
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-[19px] font-extrabold text-[#e8edf6]">배너 · 하우스광고</h1>
        </header>
        <ErrorState
          tone="admin"
          title="배너 목록을 지금 불러오지 못했어요"
          desc="등록된 배너가 0건인 게 아니라 조회가 실패했습니다. 이 상태에서 새 배너를 만들면 기존 배너와 겹칠 수 있으니, 목록이 다시 보일 때 편집해 주세요."
          cause={loaded.cause}
        />
      </div>
    );
  }

  const banners = loaded.banners;
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
              <span className="text-[11px] font-semibold text-ai-accent">
                {ad.ctaLabel} → {ad.href}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
