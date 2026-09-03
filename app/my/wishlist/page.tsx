import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { ErrorState } from "@/app/components/ui/EmptyState";
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
  title: "관심 매물 · 내집나우",
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

type SavedListingsResult =
  | { ok: true; items: ListingDetail[]; failedCount: number }
  | { ok: false; cause: string };

/* 실패를 빈 배열로 누르면 "아직 저장한 매물이 없어요"가 된다 — 조회 실패와
   "없음"은 다른 사실이다. 목록 전체 실패는 ok:false 로, 개별 매물 해석 실패는
   failedCount 로 세어 화면이 "N건은 불러오지 못했어요"를 말할 수 있게 한다.
   (개별 실패에서 숨김·삭제 매물의 정상 null 과 조회 오류를 구분한다.) */
async function loadSavedListings(email: string): Promise<SavedListingsResult> {
  let bms;
  try {
    bms = await listBookmarks(email, "listing");
  } catch (e) {
    return { ok: false, cause: e instanceof Error ? e.message : String(e) };
  }
  const ids = Array.from(new Set(bms.map((b) => b.targetId))).slice(0, 100);
  let failedCount = 0;
  const resolved = await Promise.all(
    ids.map((id) =>
      getListingById(id).catch(() => {
        failedCount += 1;
        return null;
      }),
    ),
  );
  // 숨김(신고 누적 등)·삭제·비공개 매물은 관심 목록에서 제외 (표시 전용)
  const items = resolved.filter(
    (l): l is ListingDetail => l !== null && !l.isHidden && l.status !== "rejected",
  );
  return { ok: true, items, failedCount };
}

export default async function WishlistPage() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/my/wishlist");
  }

  const loaded = await loadSavedListings(session.user.email);
  const items = loaded.ok ? loaded.items : [];

  return (
    <PageShell breadcrumb="마이 › 관심 매물" title="관심 매물">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="t-body text-text-3">저장한 매물 {items.length}개</p>
        <Link href="/complex/browse" className="t-body font-bold text-primary no-underline">
          관심 단지 둘러보기 →
        </Link>
      </div>

      {!loaded.ok ? (
        <ErrorState
          title="관심 매물을 지금 불러오지 못했어요"
          desc="저장한 매물이 0개인 게 아니라 조회 자체가 실패했습니다. 잠시 후 새로고침해 주세요."
          cause={loaded.cause}
        />
      ) : items.length === 0 ? (
        <div className="rise-in card card-pad-sm flex flex-col items-center gap-3 py-14 text-center">
          <div className="t-title">
            <Icon name="🤍" size={26} />
          </div>
          <div className="t-section text-ink">아직 저장한 매물이 없어요</div>
          <p className="max-w-[420px] t-body text-text-3">
            마음에 드는 매물의 관심(♥) 버튼을 누르면 여기에 모여요. 실거래가와 비교하며
            천천히 살펴보세요.
          </p>
          <Link href="/listings" className="btn-primary btn-md no-underline">
            매물 둘러보기
          </Link>
        </div>
      ) : (
        <>
          {loaded.ok && loaded.failedCount > 0 && (
            <p className="mb-3 rounded-xl border border-line bg-bg px-3 py-2 t-sub text-text-2">
              저장한 매물 중 {loaded.failedCount}건은 지금 불러오지 못했어요 — 삭제된 게
              아니라 조회가 실패한 것일 수 있습니다. 잠시 후 새로고침해 주세요.
            </p>
          )}
          <div className="rise-in grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((l) => {
            const stale = isListingStale(l);
            return (
              <div key={l.id} className="card card-pad-sm flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-bg chip-pad t-sub font-extrabold text-text-2">
                    {LISTING_TYPE_LABEL[l.listingType]}
                  </span>
                  {l.ownerVerified && (
                    <span className="rounded-md bg-success-soft chip-pad t-sub font-extrabold text-success">
                      소유확인
                    </span>
                  )}
                  {stale && (
                    <span
                      className="rounded-md chip-pad t-sub font-extrabold"
                      style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
                    >
                      확인 필요
                    </span>
                  )}
                </div>

                <Link
                  href={`/listings/${l.id}`}
                  className="t-section text-ink hover:underline"
                >
                  {l.complexName}
                </Link>
                <div className="t-section text-primary">{priceLine(l)}</div>
                <div className="t-sub text-text-3">
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
        </>
      )}
    </PageShell>
  );
}
