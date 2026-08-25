"use client";

/* 실매물 목록 + 필터 (2026-08-10 ISR 전환, /town/news·/dev-deals 레시피)
   서버가 ?type/gu/complex 를 읽어 필터별로 DB 를 다시 질의하던 것을, 전체
   (승인 매물 ≤200건)를 한 번 받아 여기서 exact 일치로 거른다 — 서버의
   .eq(listing_type/region_name/complex_name) 과 같은 의미다.
   useSearchParams 금지(프리렌더 HTML 에서 카드가 사라진다) — SSR 은 전체를
   그리고, 필터는 마운트 후 location.search + popstate 로 적용한다. */

import Link from "next/link";
import { useEffect, useState } from "react";
// store-db 는 server-only(supabase service) 를 끌고 와 클라이언트에서 import 불가.
// 타입은 type-only import(컴파일 시 소거)로 가져오고, 라벨 상수 2개만 여기 복제한다.
// 원본: lib/listings/store-db.ts 의 LISTING_TYPE_LABEL·LISTING_SOURCE_LABEL.
import type { PublicListing } from "@/lib/listings/store-db";

const LISTING_TYPE_LABEL: Record<string, string> = {
  sale: "매매",
  jeonse: "전세",
  monthly: "월세",
};
const LISTING_SOURCE_LABEL: Record<string, string> = {
  owner: "집주인 직접",
  agent: "중개사",
};
import { ListingCompareToggle } from "@/components/ListingCompareToggle";
import type { CompareListing } from "@/components/listing-compare-store";

const TYPE_FILTERS = [
  { key: "", label: "전체" },
  { key: "sale", label: "매매" },
  { key: "jeonse", label: "전세" },
  { key: "monthly", label: "월세" },
];
const TYPE_KEYS = ["sale", "jeonse", "monthly"];

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

/** 부스트 활성 — 클라이언트에서 계산하므로 ISR 주기와 무관하게 현재 시각 기준 */
function isBoostActive(boostUntil: string | null): boolean {
  if (!boostUntil) return false;
  const t = Date.parse(boostUntil);
  return Number.isFinite(t) && t > Date.now();
}

function toCompareListing(l: PublicListing): CompareListing {
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
  };
}

type Filter = { type: string; gu: string; complex: string };

function pushFilterUrl(next: Filter) {
  const url = new URL(window.location.href);
  const sp = url.searchParams;
  if (next.type) sp.set("type", next.type);
  else sp.delete("type");
  if (next.gu) sp.set("gu", next.gu);
  else sp.delete("gu");
  if (next.complex) sp.set("complex", next.complex);
  else sp.delete("complex");
  window.history.pushState(null, "", url);
}

export function ListingsListClient({
  items,
  seoulGus,
}: {
  items: PublicListing[];
  seoulGus: readonly string[];
}) {
  const [filter, setFilter] = useState<Filter>({ type: "", gu: "", complex: "" });
  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(window.location.search);
      const t = (p.get("type") ?? "").trim();
      setFilter({
        type: TYPE_KEYS.includes(t) ? t : "",
        gu: (p.get("gu") ?? "").trim(),
        complex: (p.get("complex") ?? "").trim(),
      });
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const set = (patch: Partial<Filter>) => {
    const next = { ...filter, ...patch };
    setFilter(next);
    pushFilterUrl(next);
  };

  const list = items.filter(
    (l) =>
      (!filter.type || l.listingType === filter.type) &&
      (!filter.gu || l.regionName === filter.gu) &&
      (!filter.complex || l.complexName === filter.complex),
  );

  return (
    <>
      {filter.complex && (
        <div className="rise-in mb-3 flex items-center gap-2 text-[13px] text-text-2">
          <span>
            단지 <b className="text-ink">{filter.complex}</b> 매물만 보는 중
          </span>
          <button
            type="button"
            onClick={() => set({ complex: "" })}
            className="font-bold text-primary underline"
          >
            전체 보기
          </button>
        </div>
      )}

      {/* 유형 필터 */}
      <div className="rise-in mb-2 flex gap-1.5 overflow-x-auto text-[13px]">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key || "all"}
            type="button"
            onClick={() => set({ type: f.key })}
            aria-pressed={filter.type === f.key}
            className={`chip px-3.5 py-2 ${
              filter.type === f.key ? "chip-active" : "bg-[var(--glass-bg)] text-text-2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 서울 구 필터 */}
      <div className="rise-in-1 mb-5 flex gap-1.5 overflow-x-auto pb-1 text-[12px]">
        <button
          type="button"
          onClick={() => set({ gu: "" })}
          aria-pressed={!filter.gu}
          className={`chip shrink-0 px-3 py-1.5 ${
            !filter.gu ? "chip-active" : "bg-[var(--glass-bg)] text-text-2"
          }`}
        >
          서울 전체
        </button>
        {seoulGus.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => set({ gu: g })}
            aria-pressed={filter.gu === g}
            className={`chip shrink-0 px-3 py-1.5 ${
              filter.gu === g ? "chip-active" : "bg-[var(--glass-bg)] text-text-2"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rise-in-1 card card-pad-sm flex flex-col items-center gap-3 py-14 text-center">
          <div className="text-[15px] font-extrabold text-ink">
            이 조건에 검수된 매물이 아직 없어요
          </div>
          <p className="max-w-[420px] text-[13px] leading-[1.7] text-text-3">
            베타 기간에는 매물 공급이 적을 수 있어요. 집주인은 소유 확인 후 직접 등록하고,
            중개사무소는 제휴로 노출할 수 있어요. 임장 기록은{" "}
            <Link href="/notes/new" className="font-bold text-primary underline">
              임장노트
            </Link>
            로 이어가세요.
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
          {list.map((l) => {
            const boostOn = isBoostActive(l.boostUntil);
            const desc = l.description?.replace(/^\[[^\]]{1,10}\]\s*/, "") ?? "";
            return (
              <Link
                key={l.id}
                href={`/listings/${l.id}`}
                className="card tile card-pad-sm flex flex-col gap-2"
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
                    className={`rounded-[6px] chip-pad text-[11px] font-extrabold ${
                      l.source === "owner"
                        ? "bg-[rgba(29,79,216,.08)] text-primary"
                        : "bg-warning-soft text-warning"
                    }`}
                  >
                    {LISTING_SOURCE_LABEL[l.source]}
                  </span>
                  <span className="rounded-[6px] bg-bg chip-pad text-[11px] font-extrabold text-text-2">
                    {LISTING_TYPE_LABEL[l.listingType]}
                  </span>
                  {l.ownerVerified && (
                    <span className="rounded-[6px] bg-success-soft chip-pad text-[11px] font-extrabold text-success">
                      소유확인
                    </span>
                  )}
                  {boostOn && (
                    <span className="rounded-[6px] bg-[rgba(245,158,11,.14)] chip-pad text-[11px] font-extrabold text-[#b45309]">
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
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="text-[12px] font-bold text-primary">상세 보기 →</span>
                  <ListingCompareToggle item={toCompareListing(l)} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export default ListingsListClient;
