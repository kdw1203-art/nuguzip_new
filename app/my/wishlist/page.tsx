import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { Icon } from "@/app/components/Icon";
import { safeAuth } from "@/lib/safe-auth";
import { listBookmarks } from "@/lib/bookmarks/store";
import {
  getListingById,
  LISTING_TYPE_LABEL,
  isListingStale,
  type ListingDetail,
} from "@/lib/listings/store-db";

/* ============================================================
   관심 매물 — /my/wishlist (로그인 필수)
   bookmarks(target_type='listing') → 매물 데이터 조인. 숨김·삭제 매물은 자연 제외.
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "관심 매물 · 누구집",
  robots: { index: false, follow: false },
};

function formatKrwShort(krw: number | null | undefined): string {
  if (krw === null || krw === undefined || !Number.isFinite(krw) || krw <= 0) return "—";
  if (krw >= 1e8) {
    const eok = krw / 1e8;
    return `${(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR")}억`;
  }
  return `${Math.round(krw / 1e4).toLocaleString("ko-KR")}만`;
}

function priceLine(l: ListingDetail): string {
  if (l.listingType === "sale") return `매매 ${formatKrwShort(l.priceKrw)}`;
  if (l.listingType === "jeonse") return `전세 ${formatKrwShort(l.depositKrw)}`;
  return `월세 ${formatKrwShort(l.depositKrw)} / ${formatKrwShort(l.monthlyKrw)}`;
}

async function loadSavedListings(email: string): Promise<ListingDetail[]> {
  try {
    const bms = await listBookmarks(email, "listing");
    const ids = Array.from(new Set(bms.map((b) => b.targetId))).slice(0, 100);
    const resolved = await Promise.all(ids.map((id) => getListingById(id).catch(() => null)));
    // 숨김(신고 누적 등)·삭제·비공개 매물은 관심 목록에서 제외 (표시 전용)
    return resolved.filter(
      (l): l is ListingDetail => l !== null && !l.isHidden && l.status !== "rejected",
    );
  } catch {
    return [];
  }
}

export default async function WishlistPage() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/my/wishlist");
  }

  const items = await loadSavedListings(session.user.email);

  return (
    <PageShell breadcrumb="마이 › 관심 매물" title="관심 매물">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-3">저장한 매물 {items.length}개</p>
        <Link href="/complex/browse" className="text-[13px] font-bold text-primary no-underline">
          관심 단지 둘러보기 →
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rise-in card card-pad-sm flex flex-col items-center gap-3 py-14 text-center">
          <div className="text-[26px]">
            <Icon name="🤍" size={26} />
          </div>
          <div className="text-[15px] font-extrabold text-ink">아직 저장한 매물이 없어요</div>
          <p className="max-w-[420px] text-[13px] leading-[1.7] text-text-3">
            마음에 드는 매물의 관심(♥) 버튼을 누르면 여기에 모여요. 실거래가와 비교하며
            천천히 살펴보세요.
          </p>
          <Link href="/listings" className="btn-primary btn-md no-underline">
            매물 둘러보기
          </Link>
        </div>
      ) : (
        <div className="rise-in grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((l) => {
            const stale = isListingStale(l);
            return (
              <div key={l.id} className="card card-pad-sm flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-[6px] bg-[#f2f4f8] px-2 py-[3px] text-[11px] font-extrabold text-text-2">
                    {LISTING_TYPE_LABEL[l.listingType]}
                  </span>
                  {l.ownerVerified && (
                    <span className="rounded-[6px] bg-[rgba(26,127,78,.1)] px-2 py-[3px] text-[11px] font-extrabold text-[#1a7f4e]">
                      소유확인
                    </span>
                  )}
                  {stale && (
                    <span
                      className="rounded-[6px] px-2 py-[3px] text-[11px] font-extrabold"
                      style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
                    >
                      확인 필요
                    </span>
                  )}
                </div>

                <Link
                  href={`/listings/${l.id}`}
                  className="text-[15px] font-extrabold leading-[1.4] text-ink hover:underline"
                >
                  {l.complexName}
                </Link>
                <div className="text-[15px] font-extrabold text-primary">{priceLine(l)}</div>
                <div className="text-[12px] text-text-3">
                  {[
                    l.regionName,
                    l.areaM2 !== null ? `${l.areaM2}㎡` : null,
                    l.floor !== null ? `${l.floor}층` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>

                <div className="mt-1">
                  <Link href={`/listings/${l.id}`} className="btn-outline btn-sm no-underline">
                    상세 보기
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
