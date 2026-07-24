import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedSearchScope } from "@/lib/saved-search/types";

/**
 * 저장 검색 알림 매처 — scope+query 로 현재 매치 수를 센다.
 * 저장 검색은 filters 가 비어 있고 자유 검색어(query)가 유일한 조건이라,
 * query 를 각 scope 데이터 소스(매물·실거래·경매)에 ILIKE 로 매칭한다.
 */

/** PostgREST or/ilike 에 안전하도록 정제: 한글·영숫자·공백만 남기고 60자 제한. */
export function sanitizeQuery(q: string): string {
  return q
    .replace(/[^0-9A-Za-z가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** 정제된 검색어 → ILIKE 패턴. 공백은 %로 바꿔 "A…B" 부분매칭 + or 필터 공백 이슈 회피. */
function likePattern(sanitized: string): string {
  return `%${sanitized.replace(/\s+/g, "%")}%`;
}

/**
 * 저장 검색 조건의 현재 매치 수.
 * - query 정제 후 비면: listings 는 전체 승인 매물 수, map/complex/auctions 는 null(광범위 → 알림 제외).
 * - 조회 실패 시 null(해당 회차 스킵).
 */
export async function countSavedSearchMatches(
  read: SupabaseClient,
  scope: SavedSearchScope,
  rawQuery: string,
): Promise<number | null> {
  const q = sanitizeQuery(rawQuery);
  const p = likePattern(q);
  try {
    if (scope === "listings") {
      let query = read
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .eq("is_hidden", false);
      if (q) {
        query = query.or(
          `complex_name.ilike.${p},region_name.ilike.${p},description.ilike.${p}`,
        );
      }
      const { count, error } = await query;
      return error ? null : count ?? 0;
    }

    if (scope === "map" || scope === "complex") {
      if (!q) return null; // 전체 실거래 카운트는 광범위 → 알림 무의미
      const { count, error } = await read
        .from("market_transactions")
        .select("id", { count: "exact", head: true })
        .eq("transaction_type", "trade")
        .or(`complex_name.ilike.${p},region_name.ilike.${p},address.ilike.${p}`);
      return error ? null : count ?? 0;
    }

    if (scope === "auctions") {
      if (!q) return null;
      const [court, onbid] = await Promise.all([
        read
          .from("court_auctions")
          .select("external_key", { count: "exact", head: true })
          .or(`name.ilike.${p},address.ilike.${p},sido.ilike.${p},sigungu.ilike.${p}`),
        read
          .from("onbid_auctions")
          .select("external_key", { count: "exact", head: true })
          .or(`name.ilike.${p},sido.ilike.${p},sigungu.ilike.${p}`),
      ]);
      if (court.error && onbid.error) return null;
      return (court.error ? 0 : court.count ?? 0) + (onbid.error ? 0 : onbid.count ?? 0);
    }

    return null;
  } catch {
    return null;
  }
}

/** scope → 알림 클릭 시 이동 경로. */
export function scopeActionUrl(scope: SavedSearchScope, query: string): string {
  const q = encodeURIComponent(query.trim());
  switch (scope) {
    case "listings":
      return "/listings";
    case "auctions":
      return "/auctions";
    case "complex":
      return q ? `/search?q=${q}` : "/complex/browse";
    case "map":
    default:
      return "/map";
  }
}
