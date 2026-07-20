import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { ReportButton } from "../../components/ReportButton";
import { NaverMap } from "@/components/map/NaverMap";
import { safeAuth } from "@/lib/safe-auth";
import {
  getListingById,
  incrementView,
  LISTING_TYPE_LABEL,
  LISTING_SOURCE_LABEL,
  type ListingDetail,
} from "@/lib/listings/store-db";
import {
  SEOUL_BROWSE_REGIONS,
  buildComplexTxSlug,
} from "@/lib/market/complex-transactions";

/* ============================================================
   매물 상세 — /listings/[id]
   승인(approved)만 공개. 소유주는 본인 검수중 매물도 열람 가능.
   ============================================================ */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "매물 상세 · 누구집",
  description: "집주인 직접·중개사 등록 매물의 상세 정보. 실거래가와 비교하며 확인하세요.",
};

/** 원(KRW) → "28.6억" / "9,800만" */
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

function txCompareHref(l: ListingDetail): string | null {
  if (!l.regionName) return null;
  const region = SEOUL_BROWSE_REGIONS.find((r) => r.name === l.regionName);
  if (!region) return null;
  return `/complex/tx/${buildComplexTxSlug(l.complexName, region.id)}`;
}

/** 설명 앞의 [유형] 태그를 분리 (건물 유형 별도 컬럼 대체) */
function splitCategory(description: string | null): { category: string | null; body: string } {
  const raw = description ?? "";
  const m = raw.match(/^\[([^\]]{1,10})\]\s*/);
  if (m) return { category: m[1], body: raw.slice(m[0].length) };
  return { category: null, body: raw };
}

function isBoostActive(boostUntil: string | null): boolean {
  if (!boostUntil) return false;
  const t = Date.parse(boostUntil);
  return Number.isFinite(t) && t > Date.now();
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await getListingById(id);
  if (!listing) notFound();

  const session = await safeAuth();
  const viewerEmail = session?.user?.email ?? null;
  const isOwner = viewerEmail !== null && viewerEmail === listing.authorEmail;

  // 승인 전 매물은 소유주 본인만 열람 가능
  if (listing.status !== "approved" && !isOwner) notFound();

  // 조회수 +1 — 공개(승인) 매물이며 본인 조회가 아닐 때만 (best-effort)
  if (listing.status === "approved" && !isOwner) {
    await incrementView(id);
  }

  const { category, body } = splitCategory(listing.description);
  const txHref = txCompareHref(listing);
  const boostOn = isBoostActive(listing.boostUntil);
  const hasCoord = listing.lat !== null && listing.lng !== null;
  const photos = listing.photos.length > 0
    ? listing.photos
    : listing.thumbnailUrl
      ? [listing.thumbnailUrl]
      : [];

  return (
    <PageShell breadcrumb="홈 › 실매물 › 상세">
      {/* 상태 안내 (소유주가 검수중/반려 매물을 볼 때) */}
      {listing.status !== "approved" && (
        <div className="rise-in mb-4 rounded-xl bg-[rgba(29,79,216,.06)] px-4 py-3 text-[13px] leading-[1.7] text-[#5b74b8]">
          {listing.status === "pending" && "이 매물은 검수 중이에요. 승인 전까지는 나에게만 보여요."}
          {listing.status === "rejected" && (
            <>
              이 매물은 반려됐어요.
              {listing.rejectReason ? ` 사유: ${listing.rejectReason}` : ""}
            </>
          )}
          {listing.status === "closed" && "이 매물은 마감 처리됐어요."}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* 좌: 본문 */}
        <div className="flex flex-col gap-5">
          {/* 사진 */}
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photos[0]}
                alt={`${listing.complexName} 대표 사진`}
                className="col-span-2 h-[280px] w-full rounded-2xl object-cover"
                loading="lazy"
              />
              {photos.slice(1, 5).map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={p}
                  alt={`${listing.complexName} 사진 ${i + 2}`}
                  className="h-[140px] w-full rounded-xl object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          ) : (
            <div className="flex h-[200px] w-full items-center justify-center rounded-2xl bg-[rgba(0,0,0,.03)] text-[13px] text-text-3">
              등록된 사진이 없어요
            </div>
          )}

          {/* 배지 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-[6px] px-2 py-[3px] text-[11px] font-extrabold ${
                listing.source === "owner"
                  ? "bg-[rgba(29,79,216,.08)] text-primary"
                  : "bg-[#fdf3e7] text-[#c07a3a]"
              }`}
            >
              {LISTING_SOURCE_LABEL[listing.source]}
            </span>
            <span className="rounded-[6px] bg-[#f2f4f8] px-2 py-[3px] text-[11px] font-extrabold text-text-2">
              {LISTING_TYPE_LABEL[listing.listingType]}
            </span>
            {category && (
              <span className="rounded-[6px] bg-[#f2f4f8] px-2 py-[3px] text-[11px] font-extrabold text-text-2">
                {category}
              </span>
            )}
            {listing.ownerVerified && (
              <span className="rounded-[6px] bg-[rgba(26,127,78,.1)] px-2 py-[3px] text-[11px] font-extrabold text-[#1a7f4e]">
                소유확인
              </span>
            )}
            {boostOn && (
              <span className="rounded-[6px] bg-[rgba(245,158,11,.14)] px-2 py-[3px] text-[11px] font-extrabold text-[#b45309]">
                부스트
              </span>
            )}
          </div>

          {/* 제목 · 가격 */}
          <div>
            <h1 className="text-[24px] font-extrabold leading-[1.3] text-ink">
              {listing.complexName}
            </h1>
            <div className="mt-1.5 text-[22px] font-extrabold text-primary">
              {priceLine(listing)}
            </div>
          </div>

          {/* 스펙 */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-text-2">
            {listing.areaM2 !== null && (
              <span>
                전용 <b className="text-ink">{listing.areaM2}㎡</b>
              </span>
            )}
            {listing.floor !== null && (
              <span>
                <b className="text-ink">{listing.floor}층</b>
              </span>
            )}
            {listing.regionName && (
              <span>
                지역 <b className="text-ink">{listing.regionName}</b>
              </span>
            )}
            <span>
              조회 <b className="text-ink">{listing.viewCount.toLocaleString("ko-KR")}</b>
            </span>
          </div>

          {/* 주소 */}
          {listing.address && (
            <div className="rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[13px] leading-[1.6] text-text-2">
              <span className="font-bold text-ink">주소</span> · {listing.address}
            </div>
          )}

          {/* 설명 */}
          {body.trim() && (
            <div>
              <div className="mb-1.5 text-[13px] font-bold text-ink">상세 설명</div>
              <p className="whitespace-pre-wrap text-[14px] leading-[1.75] text-text-2">
                {body.trim()}
              </p>
            </div>
          )}

          {/* 실거래가 비교 */}
          <Link
            href={txHref ?? "/complex/tx"}
            className="w-fit text-[13px] font-bold text-primary underline"
          >
            실거래가 비교 →
          </Link>

          {/* 신고 */}
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-text-3">이 매물에 문제가 있나요?</span>
            <ReportButton postId={listing.id} />
          </div>
        </div>

        {/* 우: 지도 + 연락 */}
        <div className="flex flex-col gap-4">
          {hasCoord && (
            <div className="h-[240px] w-full overflow-hidden rounded-2xl">
              <NaverMap
                center={{ lat: listing.lat as number, lng: listing.lng as number }}
                level={4}
                markers={[
                  {
                    id: listing.id,
                    lat: listing.lat as number,
                    lng: listing.lng as number,
                    label: listing.complexName,
                    infoHtml: "",
                  },
                ]}
                className="h-full w-full"
              />
            </div>
          )}

          {/* 연락처 — 로그인 시 노출 */}
          <div className="card card-pad-sm flex flex-col gap-2">
            <div className="text-[13px] font-bold text-ink">연락처</div>
            {viewerEmail ? (
              listing.contact ? (
                <div className="text-[14px] font-bold text-ink break-all">{listing.contact}</div>
              ) : (
                <div className="text-[13px] text-text-3">
                  등록된 연락처가 없어요. 등록자에게 직접 문의가 어려울 수 있어요.
                </div>
              )
            ) : (
              <Link
                href={`/login?callbackUrl=/listings/${listing.id}`}
                className="btn-primary btn-md w-fit"
              >
                로그인 후 연락처 확인
              </Link>
            )}
            <div className="text-[12px] text-text-3">등록자 · {listing.authorLabel}</div>
          </div>
        </div>
      </div>

      {/* 법적 고지 */}
      <div className="mt-8 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        누구집은 광고 매체이며 중개하지 않습니다. 매물 정보의 정확성과 권리관계에 대한 책임은
        등록자에게 있으며, 누구집의 검수는 형식 요건 확인일 뿐 진위를 보증하지 않습니다. 중개
        행위는 해당 매물을 등록한 개업공인중개사가 수행합니다.
      </div>
    </PageShell>
  );
}
