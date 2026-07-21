"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/app/components/Icon";
import {
  subscribe,
  has,
  count,
  toggle,
  MAX_COMPARE,
  type CompareListing,
} from "./listing-compare-store";

/**
 * 목록 카드용 "비교 담기" 토글.
 * 카드 전체가 <Link>이므로 클릭 시 이동을 막고(stopPropagation/preventDefault)
 * 비교함 스토어만 토글한다.
 */
export function ListingCompareToggle({
  item,
  className = "",
}: {
  item: CompareListing;
  className?: string;
}) {
  const active = useSyncExternalStore(
    subscribe,
    () => has(item.id),
    () => false,
  );
  const total = useSyncExternalStore(
    subscribe,
    () => count(),
    () => 0,
  );
  const full = !active && total >= MAX_COMPARE;

  return (
    <button
      type="button"
      onClick={(e) => {
        // 카드 <Link> 네비게이션 차단
        e.preventDefault();
        e.stopPropagation();
        if (full) return;
        toggle(item);
      }}
      aria-pressed={active}
      aria-disabled={full}
      title={
        full ? `비교함은 최대 ${MAX_COMPARE}개까지 담을 수 있어요` : "비교함에 담기"
      }
      className={`inline-flex shrink-0 items-center gap-1 rounded-[8px] border px-2.5 py-[5px] text-[12px] font-bold transition-colors ${
        active
          ? "border-[rgba(29,79,216,.35)] bg-primary-soft text-primary"
          : full
            ? "cursor-not-allowed border-line bg-[rgba(0,0,0,.03)] text-text-3"
            : "border-line bg-surface text-text-2 hover:border-[rgba(29,79,216,.35)] hover:text-primary"
      } ${className}`}
    >
      <Icon name={active ? "check" : "scale"} size={13} strokeWidth={2} />
      {active ? "비교중" : "비교 담기"}
    </button>
  );
}
