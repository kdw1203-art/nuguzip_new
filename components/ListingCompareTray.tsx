"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Icon } from "@/app/components/Icon";
import {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  remove,
  clear,
  MIN_COMPARE,
  MAX_COMPARE,
  type CompareListing,
} from "./listing-compare-store";

/** 원(KRW) → "28.6억" / "9,800만" (목록/상세와 동일 규칙) */
function formatKrwShort(krw: number | null | undefined): string {
  if (krw === null || krw === undefined || !Number.isFinite(krw) || krw <= 0) return "—";
  if (krw >= 1e8) {
    const eok = krw / 1e8;
    return `${(eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10).toLocaleString("ko-KR")}억`;
  }
  return `${Math.round(krw / 1e4).toLocaleString("ko-KR")}만`;
}

function priceLine(l: CompareListing): string {
  if (l.listingType === "sale") return `매매 ${formatKrwShort(l.priceKrw)}`;
  if (l.listingType === "jeonse") return `전세 ${formatKrwShort(l.depositKrw)}`;
  return `월세 ${formatKrwShort(l.depositKrw)} / ${formatKrwShort(l.monthlyKrw)}`;
}

/**
 * 화면 하단 고정 비교함 트레이 — 담긴 매물이 1개 이상일 때만 노출.
 * "비교하기 (N)" → /listings/compare?ids=a,b,c
 */
export function ListingCompareTray() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (items.length === 0) return null;

  const canCompare = items.length >= MIN_COMPARE;
  const href = `/listings/compare?ids=${items.map((i) => i.id).join(",")}`;

  return (
    <div className="fixed inset-x-0 bottom-[76px] z-40 px-4 md:bottom-6">
      <div className="glass mx-auto flex max-w-[840px] flex-col gap-2.5 rounded-2xl border border-line p-3 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
            <Icon name="scale" size={16} strokeWidth={2} />
            비교함 <span className="text-primary">({items.length})</span>
            <span className="text-[11px] font-medium text-text-3">
              / 최대 {MAX_COMPARE}
            </span>
          </div>
          <button
            type="button"
            onClick={() => clear()}
            className="text-[12px] font-bold text-text-3 hover:text-danger"
          >
            전체 비우기
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span
              key={it.id}
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-[12px]"
            >
              <span className="font-bold text-ink">{it.complexName}</span>
              <span className="text-text-3">{priceLine(it)}</span>
              <button
                type="button"
                onClick={() => remove(it.id)}
                aria-label={`${it.complexName} 비교함에서 빼기`}
                className="text-text-3 hover:text-danger"
              >
                <Icon name="x" size={13} strokeWidth={2.2} />
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-text-3">
            {canCompare
              ? "나란히 비교해 보세요"
              : `${MIN_COMPARE}개 이상 담으면 비교할 수 있어요`}
          </span>
          {canCompare ? (
            <Link href={href} className="btn-primary btn-sm">
              비교하기 ({items.length})
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="btn-primary btn-sm"
              aria-disabled="true"
            >
              비교하기 ({items.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
