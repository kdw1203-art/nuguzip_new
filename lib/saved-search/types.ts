/**
 * 저장 검색(조건 알림) 공용 타입.
 *
 * 서버(스토어·API)와 클라이언트(마이 페이지)에서 함께 쓰는 순수 타입 모듈이라
 * `server-only` 를 두지 않는다. DB 행 → 이 타입으로의 매핑은 store 에서만 수행한다.
 */

/** 저장 검색이 적용되는 탐색 범위.
 *  [개선 #13] news(동네 뉴스·커뮤니티 글)·apply(청약 공고) 추가 — 매일 새 행이
 *  생기는 유일한 콘텐츠 스트림이라 키워드 알림의 실질 가치가 가장 크다. */
export type SavedSearchScope =
  | "map"
  | "listings"
  | "complex"
  | "auctions"
  | "news"
  | "apply";

/** 클라이언트로 내려가는 저장 검색 1건 (DB 행을 좁힌 안전한 형태). */
export interface SavedSearch {
  id: string;
  userEmail: string;
  label: string;
  query: string;
  scope: SavedSearchScope;
  filters: Record<string, unknown>;
  alertEnabled: boolean;
  lastCheckedAt: string | null;
  lastMatchCount: number;
  createdAt: string;
  updatedAt: string | null;
}

/** 범위 코드 → 한국어 라벨. */
export const SCOPE_LABELS: Record<SavedSearchScope, string> = {
  map: "지도 탐색",
  listings: "실매물",
  complex: "단지",
  auctions: "공매·경매",
  news: "뉴스·동네 소식",
  apply: "청약 공고",
};

/** 문자열이 유효한 범위 코드인지 좁히는 가드. */
export function isScope(v: string): v is SavedSearchScope {
  return (
    v === "map" ||
    v === "listings" ||
    v === "complex" ||
    v === "auctions" ||
    v === "news" ||
    v === "apply"
  );
}
