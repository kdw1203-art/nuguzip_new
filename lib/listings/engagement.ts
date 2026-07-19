/**
 * 단지 참여 지표(조회수·관심도) 실데이터 접근 — 서버 전용.
 * 조회수: complex_engagement.view_count, 관심도: bookmarks(target_type='complex') 집계.
 * Supabase 미설정 시 안전하게 빈 맵/no-op.
 */
import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export interface ComplexEngagement {
  viewCount: number;
  bookmarkCount: number;
}

/** 단지 상세 조회 시 조회수 +1 (원자적 RPC). 실패는 무시. */
export async function recordComplexView(complexId: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb || !complexId) return;
  try {
    await sb.rpc("increment_complex_view", { p_complex_id: complexId });
  } catch (err) {
    logger.warn("[engagement] recordComplexView failed", err);
  }
}

/** 주어진 단지 id들의 실제 조회수·관심(북마크) 수 맵. 데이터 없으면 빈 맵. */
export async function getEngagementMap(ids: string[]): Promise<Map<string, ComplexEngagement>> {
  const map = new Map<string, ComplexEngagement>();
  const sb = getServiceSupabase();
  if (!sb || ids.length === 0) return map;
  const uniq = [...new Set(ids)].slice(0, 500);
  try {
    const [views, marks] = await Promise.all([
      sb.from("complex_engagement").select("complex_id,view_count").in("complex_id", uniq),
      sb.from("bookmarks").select("target_id").eq("target_type", "complex").in("target_id", uniq),
    ]);
    for (const r of views.data ?? []) {
      map.set(String(r.complex_id), {
        viewCount: Number(r.view_count) || 0,
        bookmarkCount: 0,
      });
    }
    for (const r of marks.data ?? []) {
      const id = String(r.target_id);
      const cur = map.get(id) ?? { viewCount: 0, bookmarkCount: 0 };
      cur.bookmarkCount += 1;
      map.set(id, cur);
    }
  } catch (err) {
    logger.warn("[engagement] getEngagementMap failed", err);
  }
  return map;
}
