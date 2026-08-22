import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { regionIdForName } from "@/lib/region/catalog";
import { logger } from "@/lib/log";

/* [개선 #19] 뉴스→지역 연결률 — 자동수집 뉴스가 지역 허브(/region/[id])로
 * 실제로 연결되는 비율. 뉴스 상세는 post.region 을 regionIdForName 으로 풀어
 * 지역 허브 링크를 그리므로, 매핑 실패 = 내부 링크 유실 = SEO·회유 손실이다.
 * 이 지표는 그 유실을 관리자 화면에서 보이게 한다(연결률과 미매핑 상위 값). */

export type NewsRegionLinkage = {
  total: number;
  linked: number;
  /** 매핑 실패 region 값 상위 (없음/빈 값은 "(없음)" 으로 묶음) */
  topUnlinked: Array<{ region: string; count: number }>;
};

const FETCH_CAP = 3000;

export async function loadNewsRegionLinkage(): Promise<NewsRegionLinkage | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("board_posts")
      .select("region")
      .eq("board_type", "community")
      .eq("is_published", true)
      .eq("is_automated", true)
      .order("created_at", { ascending: false })
      .limit(FETCH_CAP);
    if (error || !Array.isArray(data)) {
      logger.error("[news-region-link] 조회 실패", error ?? "invalid");
      return null;
    }
    let linked = 0;
    const unlinkedCount = new Map<string, number>();
    for (const row of data as Array<Record<string, unknown>>) {
      const region = typeof row.region === "string" ? row.region.trim() : "";
      if (region && regionIdForName(region)) {
        linked += 1;
      } else {
        const key = region || "(없음)";
        unlinkedCount.set(key, (unlinkedCount.get(key) ?? 0) + 1);
      }
    }
    const topUnlinked = [...unlinkedCount.entries()]
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return { total: data.length, linked, topUnlinked };
  } catch (e) {
    logger.error("[news-region-link]", e);
    return null;
  }
}
