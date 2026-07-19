import type { CompareSide } from "@/components/compare/compare-board";
import type { HomeRegion } from "@/lib/landing/data";

/** 동네 이야기 등에서 집계된 상위 두 지역으로 비교 카드 좌우 축을 만듭니다(목업 지표). */
export function compareSidesFromTopRegions(
  regions: HomeRegion[],
  options?: { caption?: string },
): {
  left: CompareSide;
  right: CompareSide;
  caption: string;
} | null {
  const sorted = [...regions].sort((a, b) => b.count - a.count || b.pct - a.pct);
  const a = sorted[0];
  const b = sorted[1];
  if (!a || !b) return null;
  const nameA = `${a.city} ${a.district}`.trim() || a.city || "지역 A";
  const nameB = `${b.city} ${b.district}`.trim() || b.city || "지역 B";
  return {
    left: {
      name: nameA,
      tx_count_12m: Math.max(12, Math.round(a.count * 2.8 + a.pct * 1.5)),
      safety_index: Math.min(96, Math.max(56, Math.round(58 + a.pct * 0.45))),
    },
    right: {
      name: nameB,
      tx_count_12m: Math.max(12, Math.round(b.count * 2.8 + b.pct * 1.5)),
      safety_index: Math.min(96, Math.max(56, Math.round(58 + b.pct * 0.45))),
    },
    caption:
      options?.caption ??
      "동네 이야기에서 관심이 많은 순으로 상위 두 지역을 불러왔어요 · 목업 거래량/안전지수입니다.",
  };
}
