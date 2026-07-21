import type { Metadata } from "next";
import { PageShell } from "../../components/PageShell";
import { ListingCompareView } from "@/components/ListingCompareView";
import { getListingById } from "@/lib/listings/store-db";
import { comparePriceToMarket } from "@/lib/listings/price-compare";
import { MAX_COMPARE, type MarketAwareCompareListing } from "@/components/listing-compare-store";

/* ============================================================
   매물 비교함 — /listings/compare?ids=a,b,c
   목록에서 담은 매물 2~3개를 나란히 비교.
   - 선택은 세션 비교함(클라이언트 인메모리)에서 유지 → 표는 그 데이터로 렌더.
   - 공유·새로고침 등 세션이 없는 진입은 id로 서버 조회(기존 store-db 재사용).
   - 데이터가 없으면 빈 상태 안내.
   ============================================================ */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "매물 비교함 — 담은 매물 나란히 비교 · 누구집",
  description:
    "관심 매물 2~3개를 담아 가격·면적·층·시세대비·신선도·위치를 한눈에 비교하세요.",
};

/** 승인·비숨김 매물만 비교 가능한 요약으로 변환 + 시세대비 산출(매매·데이터 있을 때). */
async function loadServerItem(id: string): Promise<MarketAwareCompareListing | null> {
  const l = await getListingById(id).catch(() => null);
  if (!l || l.isHidden || l.status !== "approved") return null;

  let marketDeltaPct: number | null = null;
  try {
    const cmp = await comparePriceToMarket({
      complexName: l.complexName,
      regionName: l.regionName,
      areaM2: l.areaM2,
      listingType: l.listingType,
      priceKrw: l.priceKrw,
      depositKrw: l.depositKrw,
    });
    marketDeltaPct = cmp?.deltaPct ?? null;
  } catch {
    marketDeltaPct = null;
  }

  return {
    id: l.id,
    complexName: l.complexName,
    regionName: l.regionName,
    listingType: l.listingType,
    priceKrw: l.priceKrw,
    depositKrw: l.depositKrw,
    monthlyKrw: l.monthlyKrw,
    areaM2: l.areaM2,
    floor: l.floor,
    createdAt: l.createdAt,
    refreshedAt: l.refreshedAt,
    source: l.source,
    ownerVerified: l.ownerVerified,
    marketDeltaPct,
  };
}

export default async function ListingComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const sp = await searchParams;
  const ids = (sp.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, MAX_COMPARE);

  const fetched = await Promise.all(ids.map((id) => loadServerItem(id)));
  const serverItems = fetched.filter((x): x is MarketAwareCompareListing => x !== null);

  return (
    <PageShell breadcrumb="홈 › 실매물 › 비교함">
      <div className="mb-4">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">매물 비교함</h1>
        <p className="mt-1 text-[13px] text-text-3">
          담은 매물의 가격·면적·층·시세대비·신선도·위치를 나란히 비교해요.
        </p>
      </div>

      <ListingCompareView ids={ids} serverItems={serverItems} />
    </PageShell>
  );
}
