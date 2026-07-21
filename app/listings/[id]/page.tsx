import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { ReportButton } from "../../components/ReportButton";
import { RefreshButton } from "./RefreshButton";
import { ListingSaveButton } from "@/components/ListingSaveButton";
import { NaverMap } from "@/components/map/NaverMap";
import { safeAuth } from "@/lib/safe-auth";
import { isBookmarked } from "@/lib/bookmarks/store";
import {
  getListingById,
  incrementView,
  isListingStale,
  LISTING_TYPE_LABEL,
  LISTING_SOURCE_LABEL,
  type ListingDetail,
} from "@/lib/listings/store-db";
import {
  SEOUL_BROWSE_REGIONS,
  buildComplexTxSlug,
} from "@/lib/market/complex-transactions";
import {
  comparePriceToMarket,
  getComparableTransactions,
} from "@/lib/listings/price-compare";
import { realEstateListingJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { JsonLd } from "@/app/components/JsonLd";
import { RoadviewButton } from "@/components/map/RoadviewButton";

/** undefined 값을 가진 키를 제거한다(JSON-LD 직렬화 전 정리용). */
function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, val]) => val !== undefined),
  ) as T;
}

/* ============================================================
   매물 상세 — /listings/[id]
   승인(approved)만 공개. 소유주는 본인 검수중 매물도 열람 가능.
   ============================================================ */

export const dynamic = "force-dynamic";

/** 매물별 동적 메타데이터 — 동적 OG 카드(/api/og/listing) 이미지 포함. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const base: Metadata = {
    title: "매물 상세 · 누구집",
    description:
      "집주인 직접·중개사 등록 매물의 상세 정보. 실거래가와 비교하며 확인하세요.",
  };
  const listing = await getListingById(id).catch(() => null);
  // 미존재/숨김 매물은 OG 카드를 노출하지 않는다.
  if (!listing || listing.isHidden) return base;

  const price =
    listing.listingType === "monthly"
      ? `${formatKrwShort(listing.depositKrw)}/${formatKrwShort(listing.monthlyKrw)}`
      : formatKrwShort(listing.listingType === "sale" ? listing.priceKrw : listing.depositKrw);
  const area = listing.areaM2 !== null ? `전용 ${listing.areaM2}㎡` : "";
  const ogUrl =
    `/api/og/listing?title=${encodeURIComponent(listing.complexName)}` +
    `&price=${encodeURIComponent(price)}` +
    `&region=${encodeURIComponent(listing.regionName ?? "")}` +
    `&area=${encodeURIComponent(area)}` +
    `&type=${encodeURIComponent(LISTING_TYPE_LABEL[listing.listingType])}`;

  const title = `${listing.complexName} · ${priceLine(listing)} · 누구집`;
  const description =
    `${listing.regionName ? `${listing.regionName} · ` : ""}${LISTING_TYPE_LABEL[listing.listingType]} 매물 — 실거래가와 비교하며 확인하세요.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl],
    },
  };
}

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

/** "202606" → "2026.06" */
function formatYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

/** 시세 대비 배지 — 저렴(파랑)·비쌈(빨강)·시세 수준(회색) */
function priceCompareBadge(deltaPct: number): { label: string; className: string } {
  if (deltaPct <= -3) {
    return { label: `시세 대비 저렴 ${deltaPct}%`, className: "bg-primary-soft text-primary" };
  }
  if (deltaPct >= 3) {
    return { label: `시세 대비 +${deltaPct}%`, className: "bg-danger-soft text-danger" };
  }
  return { label: "시세 수준", className: "bg-[#f2f4f8] text-text-2" };
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

  // 숨김(신고 누적 등) 매물은 공개 열람 불가 — 소유주 본인만 열람 가능
  if (listing.isHidden && !isOwner) notFound();

  // 승인 전 매물은 소유주 본인만 열람 가능
  if (listing.status !== "approved" && !isOwner) notFound();

  // 조회수 +1 — 공개(승인) 매물이며 본인 조회가 아닐 때만 (best-effort)
  if (listing.status === "approved" && !isOwner) {
    await incrementView(id);
  }

  // #1 관심 저장 초기 상태 · #6 신선도("확인 필요") 판정
  const savedInitial = viewerEmail
    ? await isBookmarked(viewerEmail, "listing", listing.id).catch(() => false)
    : false;
  const stale = isListingStale(listing);

  const { category, body } = splitCategory(listing.description);
  const txHref = txCompareHref(listing);
  const boostOn = isBoostActive(listing.boostUntil);
  const hasCoord = listing.lat !== null && listing.lng !== null;
  const photos = listing.photos.length > 0
    ? listing.photos
    : listing.thumbnailUrl
      ? [listing.thumbnailUrl]
      : [];

  // 시세 비교 (매매 매물 + 같은 단지/면적대 실거래 존재 시에만) — graceful
  const priceCompare = await comparePriceToMarket({
    complexName: listing.complexName,
    regionName: listing.regionName,
    areaM2: listing.areaM2,
    listingType: listing.listingType,
    priceKrw: listing.priceKrw,
    depositKrw: listing.depositKrw,
  }).catch(() => null);
  const comparableTx = priceCompare
    ? await getComparableTransactions({
        complexName: listing.complexName,
        regionName: listing.regionName,
        areaM2: listing.areaM2,
      }).catch(() => [])
    : [];
  const compareBadge = priceCompare ? priceCompareBadge(priceCompare.deltaPct) : null;

  // JSON-LD (RealEstateListing) — 실데이터 매물, 존재 필드만
  const listingJsonLd = realEstateListingJsonLd({
    id: listing.id,
    name: listing.complexName,
    description: body.trim() || null,
    priceKrw: listing.listingType === "sale" ? listing.priceKrw : listing.depositKrw,
    offerLabel: LISTING_TYPE_LABEL[listing.listingType],
    areaM2: listing.areaM2,
    address: listing.address,
    regionName: listing.regionName,
    images: photos,
  });

  // JSON-LD(항목 H37) — Product/Offer. 이미 가진 페이지 데이터만 사용, undefined 정리.
  const productName = listing.complexName || listing.regionName || undefined;
  const productJsonLd = productName
    ? pruneUndefined({
        "@context": "https://schema.org",
        "@type": "Product",
        name: productName,
        category: LISTING_TYPE_LABEL[listing.listingType],
        offers: pruneUndefined({
          "@type": "Offer",
          price: listing.priceKrw ?? undefined,
          priceCurrency: "KRW",
          availability: "https://schema.org/InStock",
        }),
      })
    : null;

  return (
    <PageShell breadcrumb="홈 › 실매물 › 상세">
      {/* JSON-LD(RealEstateListing) — SEO 구조화 데이터 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(listingJsonLd) }}
      />
      {/* JSON-LD(항목 H37) — Product/Offer 구조화 데이터 */}
      {productJsonLd && <JsonLd data={productJsonLd} />}
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
            {stale && (
              <span
                className="rounded-[6px] px-2 py-[3px] text-[11px] font-extrabold"
                style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
              >
                확인 필요
              </span>
            )}
          </div>

          {/* 제목 · 가격 */}
          <div>
            <h1 className="text-[24px] font-extrabold leading-[1.3] text-ink">
              {listing.complexName}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[22px] font-extrabold text-primary">
                {priceLine(listing)}
              </span>
              {compareBadge && (
                <span
                  className={`rounded-[7px] px-2 py-[3px] text-[12px] font-extrabold ${compareBadge.className}`}
                >
                  {compareBadge.label}
                </span>
              )}
            </div>
          </div>

          {/* 관심 저장(#1) · 소유주 끌어올리기(#6) */}
          <div className="flex flex-wrap items-center gap-2">
            <ListingSaveButton
              listingId={listing.id}
              label={listing.complexName}
              initialSaved={savedInitial}
            />
            {isOwner && stale && <RefreshButton listingId={listing.id} />}
          </div>
          {stale && (
            <p className="text-[12px] leading-[1.6] text-text-3">
              마지막 갱신 이후 시간이 지난 매물이에요. 정보가 유효한지 등록자에게 확인해 주세요.
              {isOwner ? " 끌어올리기를 누르면 최신 매물로 다시 노출돼요." : ""}
            </p>
          )}

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

          {/* 시세 비교 — 같은 단지·면적대 최근 실거래 + 시세 대비 배지 (데이터 있을 때만) */}
          {priceCompare && compareBadge ? (
            <section className="card card-pad-sm flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-extrabold text-ink">
                  시세 비교{" "}
                  <span className="text-[11px] font-medium text-text-3">
                    같은 단지·면적대 · 국토부 실거래가
                  </span>
                </h2>
                <span
                  className={`shrink-0 rounded-[7px] px-2 py-[3px] text-[12px] font-extrabold ${compareBadge.className}`}
                >
                  {compareBadge.label}
                </span>
              </div>
              <p className="text-[13px] leading-[1.6] text-text-2">
                최근 실거래 중위가{" "}
                <b className="text-ink">{formatKrwShort(priceCompare.medianKrw)}</b> · 표본{" "}
                {priceCompare.sampleCount}건
                {listing.areaM2 !== null ? ` · 전용 ${listing.areaM2}㎡ 기준` : ""}
              </p>
              {comparableTx.length > 0 && (
                <ul className="flex flex-col">
                  {comparableTx.slice(0, 4).map((t, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0"
                    >
                      <span className="text-[12px] text-text-3">
                        {formatYm(t.contractYm)}
                        {t.contractDay ? `.${String(t.contractDay).padStart(2, "0")}` : ""}
                        {t.areaM2 !== null ? ` · ${t.areaM2.toFixed(1)}㎡` : ""}
                        {t.floor !== null ? ` · ${t.floor}층` : ""}
                      </span>
                      <span className="text-[13px] font-bold text-ink">
                        {formatKrwShort(t.dealAmountKrw)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={txHref ?? "/complex/browse"}
                className="w-fit text-[13px] font-bold text-primary"
              >
                이 단지 실거래 전체 →
              </Link>
            </section>
          ) : (
            <Link
              href={txHref ?? "/complex/tx"}
              className="w-fit text-[13px] font-bold text-primary underline"
            >
              실거래가 비교 →
            </Link>
          )}

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

          {/* 거리뷰(항목 A5) — 좌표가 있을 때만 (없으면 컴포넌트가 자동 숨김) */}
          {hasCoord && (
            <RoadviewButton
              lat={listing.lat as number}
              lng={listing.lng as number}
              label={listing.complexName}
            />
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
