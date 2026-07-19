/** 통합 검색 범위 — 콘텐츠 볼륨이 적을 때 정적 시드·미구현 영역 제외 */

export type SearchKind =
  | "동네"
  | "임장노트"
  | "전문가"
  | "리포트"
  | "모임"
  | "마켓"
  | "커뮤니티";

export const SEARCH_KINDS_PUBLIC: SearchKind[] = [
  "동네",
  "임장노트",
  "커뮤니티",
  "모임",
  "마켓",
  "전문가",
  "리포트",
];

/** 정적 시드(EXPERTS/REPORTS) 검색 포함 여부 — 기본 off */
export function includeStaticSearchSeeds(): boolean {
  return process.env.NEXT_PUBLIC_SEARCH_STATIC_SEEDS === "1";
}

/** DB 실데이터가 없을 때도 노출할 최소 kind (지역·UGC 중심) */
export const SEARCH_KINDS_LEAN: SearchKind[] = [
  "동네",
  "임장노트",
  "커뮤니티",
  "모임",
];

export function enabledSearchKinds(opts: {
  hasDbExperts: boolean;
  hasDbReports: boolean;
  hasMarket: boolean;
  hasMeetings: boolean;
}): SearchKind[] {
  const kinds: SearchKind[] = ["동네", "임장노트", "커뮤니티"];
  if (opts.hasMeetings) kinds.push("모임");
  if (opts.hasMarket) kinds.push("마켓");
  if (opts.hasDbExperts || includeStaticSearchSeeds()) kinds.push("전문가");
  if (opts.hasDbReports || includeStaticSearchSeeds()) kinds.push("리포트");
  return kinds;
}

export function searchKindLabel(kind: SearchKind): string {
  return kind;
}
