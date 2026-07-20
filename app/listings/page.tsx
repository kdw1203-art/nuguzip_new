import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import {
  listApprovedListings,
  isListingType,
  LISTING_TYPE_LABEL,
  LISTING_SOURCE_LABEL,
  type PublicListing,
} from "@/lib/listings/store-db";
import { DISTRICTS } from "@/lib/regions";

/* ============================================================
   실매물 목록 — /listings
   "중개사 제휴 + 집주인 직접 등록" 모델 (당근·네이버부동산 벤치마크).
   승인(approved)된 매물만 노출 · 유형/구 필터 · 최신순.
   ============================================================ */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "실매물 — 집주인 직접·중개사 등록 매물 · 누구집",
  description:
    "집주인이 직접 등록하거나 제휴 중개사가 올린 매물을 검수 후 보여드려요. 실거래가와 비교하며 확인하세요.",
};

const TYPE_FILTERS = [
  { key: "", label: "전체" },
  { key: "sale", label: "매매" },
  { key: "jeonse", label: "전세" },
  { key: "monthly", label: "월세" },
];

/** 원(KRW) → "28.6억" / "9,800만" */
function formatKrwShort(krw: number | null | undefined): string {
  if (krw === null || krw === undefined || !Number.isFinite(krw) || krw <= 0) return "—";
  if (krw >= 1e8) {
    const eok = krw / 1e8;
    return `${(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR")}억`;
  }
  return `${Math.round(krw / 1e4).toLocaleString("ko-KR")}만`;
}

function priceLine(l: PublicListing): string {
  if (l.listingType === "sale") return `매매 ${formatKrwShort(l.priceKrw)}`;
  if (l.listingType === "jeonse") return `전세 ${formatKrwShort(l.depositKrw)}`;
  return `월세 ${formatKrwShort(l.depositKrw)} / ${formatKrwShort(l.monthlyKrw)}`;
}

/** 부스트 활성 여부 — 만료 시각이 현재보다 미래일 때 */
function isBoostActive(boostUntil: string | null): boolean {
  if (!boostUntil) return false;
  const t = Date.parse(boostUntil);
  return Number.isFinite(t) && t > Date.now();
}

function buildQuery(next: { type?: string; gu?: string }): string {
  const p = new URLSearchParams();
  if (next.type) p.set("type", next.type);
  if (next.gu) p.set("gu", next.gu);
  const qs = p.toString();
  return qs ? `/listings?${qs}` : "/listings";
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; gu?: string; complex?: string }>;
}) {
  const sp = await searchParams;
  const type = isListingType(sp.type ?? "") ? (sp.type as string) : "";
  const gu = (sp.gu ?? "").trim();
  const complex = (sp.complex ?? "").trim();

  const items = await listApprovedListings({
    listingType: type ? (type as "sale" | "jeonse" | "monthly") : undefined,
    regionName: gu || undefined,
    complexName: complex || undefined,
  });

  const seoulGus = DISTRICTS["서울특별시"];

  return (
    <PageShell breadcrumb="홈 › 실매물">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="rise-in text-[22px] font-extrabold text-ink">실매물</h1>
          <p className="mt-1 text-[13px] text-text-3">
            집주인 직접 등록·제휴 중개사 매물 — 검수를 통과한 매물만 보여드려요.
          </p>
        </div>
        <Link href="/listings/new" className="btn-primary btn-md">
          지도에서 등록
        </Link>
      </div>

      {complex && (
        <div className="rise-in mb-3 flex items-center gap-2 text-[13px] text-text-2">
          <span>
            단지 <b className="text-ink">{complex}</b> 매물만 보는 중
          </span>
          <Link href={buildQuery({ type, gu })} className="font-bold text-primary underline">
            전체 보기
          </Link>
        </div>
      )}

      {/* 유형 필터 */}
      <div className="rise-in mb-2 flex gap-1.5 overflow-x-auto text-[13px]">
        {TYPE_FILTERS.map((f) => (
          <Link
            key={f.key || "all"}
            href={buildQuery({ type: f.key, gu })}
            className={`chip px-3.5 py-2 ${
              type === f.key ? "chip-active" : "bg-[rgba(255,255,255,.7)] text-text-2"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* 서울 구 필터 */}
      <div className="rise-in-1 mb-5 flex gap-1.5 overflow-x-auto pb-1 text-[12px]">
        <Link
          href={buildQuery({ type })}
          className={`chip shrink-0 px-3 py-1.5 ${
            !gu ? "chip-active" : "bg-[rgba(255,255,255,.7)] text-text-2"
          }`}
        >
          서울 전체
        </Link>
        {seoulGus.map((g) => (
          <Link
            key={g}
            href={buildQuery({ type, gu: g })}
            className={`chip shrink-0 px-3 py-1.5 ${
              gu === g ? "chip-active" : "bg-[rgba(255,255,255,.7)] text-text-2"
            }`}
          >
            {g}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rise-in-1 card card-pad-sm flex flex-col items-center gap-3 py-14 text-center">
          <div className="text-[15px] font-extrabold text-ink">
            아직 등록된 매물이 없어요 — 첫 매물을 등록해 보세요
          </div>
          <p className="max-w-[420px] text-[13px] leading-[1.7] text-text-3">
            집주인이라면 소유 확인 후 직접 등록할 수 있고, 중개사무소는 제휴를 통해
            매물을 노출할 수 있어요.
          </p>
          <div className="flex gap-2">
            <Link href="/listings/new" className="btn-primary btn-md">
              매물 등록하기
            </Link>
            <Link href="/partners" className="btn-outline btn-md">
              중개사 제휴 안내
            </Link>
          </div>
        </div>
      ) : (
        <div className="rise-in-1 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((l) => {
            const boostOn = isBoostActive(l.boostUntil);
            const desc = l.description?.replace(/^\[[^\]]{1,10}\]\s*/, "") ?? "";
            return (
              <Link
                key={l.id}
                href={`/listings/${l.id}`}
                className="card card-hover card-pad-sm flex flex-col gap-2"
              >
                {l.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.thumbnailUrl}
                    alt={`${l.complexName} 사진`}
                    className="mb-1 h-[150px] w-full rounded-xl object-cover"
                    loading="lazy"
                  />
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-[6px] px-2 py-[3px] text-[11px] font-extrabold ${
                      l.source === "owner"
                        ? "bg-[rgba(29,79,216,.08)] text-primary"
                        : "bg-[#fdf3e7] text-[#c07a3a]"
                    }`}
                  >
                    {LISTING_SOURCE_LABEL[l.source]}
                  </span>
                  <span className="rounded-[6px] bg-[#f2f4f8] px-2 py-[3px] text-[11px] font-extrabold text-text-2">
                    {LISTING_TYPE_LABEL[l.listingType]}
                  </span>
                  {l.ownerVerified && (
                    <span className="rounded-[6px] bg-[rgba(26,127,78,.1)] px-2 py-[3px] text-[11px] font-extrabold text-[#1a7f4e]">
                      소유확인
                    </span>
                  )}
                  {boostOn && (
                    <span className="rounded-[6px] bg-[rgba(245,158,11,.14)] px-2 py-[3px] text-[11px] font-extrabold text-[#b45309]">
                      부스트
                    </span>
                  )}
                  {l.regionName && (
                    <span className="text-[11px] text-text-3">{l.regionName}</span>
                  )}
                </div>
                <div className="text-[15px] font-extrabold leading-[1.4] text-ink">
                  {l.complexName}
                </div>
                <div className="text-[15px] font-extrabold text-primary">
                  {priceLine(l)}
                </div>
                <div className="text-[12px] text-text-3">
                  {[
                    l.areaM2 !== null ? `${l.areaM2}㎡` : null,
                    l.floor !== null ? `${l.floor}층` : null,
                    l.authorLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {desc.trim() && (
                  <p className="line-clamp-2 text-[13px] leading-[1.6] text-text-2">
                    {desc.trim()}
                  </p>
                )}
                <span className="mt-auto text-[12px] font-bold text-primary">
                  상세 보기 →
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* 법적 고지 */}
      <div className="mt-8 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 text-[11px] leading-[1.7] text-text-3">
        매물 정보는 등록자(집주인·중개사)가 직접 입력한 내용으로, 그 정확성에 대한
        책임은 등록자에게 있습니다. 누구집의 검수는 형식 요건 확인일 뿐 매물의 진위·
        권리관계를 보증하지 않습니다. 중개 행위는 해당 매물을 등록한 개업공인중개사가
        수행하며, 누구집은 광고 매체로서 정보를 게재할 뿐 중개 당사자가 아닙니다.
      </div>
    </PageShell>
  );
}
