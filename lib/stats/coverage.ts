import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { withBudget } from "@/lib/async/with-budget";
import { logger } from "@/lib/log";

/**
 * 서비스 커버리지 실측 — 단지 수·지역 수 (고도화 50 공유 로더).
 *
 * 원래 app/llms.txt/route.ts 안에 있던 로더를 /about 실적 숫자와 공유하기 위해
 * 뺐다. 두 화면이 각자 세면 언젠가 서로 다른 숫자를 말하게 된다.
 *
 * 원칙(항목 44와 동일): 못 읽었으면 null — 호출부는 숫자를 **생략**한다.
 * 낡은 숫자도, 지어낸 숫자도 내보내지 않는다.
 */
export type Coverage = { regions: number | null; complexes: number | null };

export async function loadCoverage(): Promise<Coverage> {
  const sb = getServiceSupabase();
  if (!sb) return { regions: null, complexes: null };
  const count = async (
    q: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  ) => {
    const { count: n, error } = await q;
    if (error || typeof n !== "number") throw new Error(error?.message ?? "count 실패");
    return n;
  };
  const run = await withBudget(
    Promise.resolve().then(async () => {
      const [complexes, regionRows] = await Promise.all([
        /* 단지 사이트맵 원본(집계 MV 뷰) — /sitemap-complexes.xml 과 같은 모집단 */
        count(sb.from("complex_sitemap_source").select("*", { count: "exact", head: true })),
        /* 지역 랜딩 모집단 — market_region_price 는 지역당 최신 1행이라
           (2026-08 현재 61행) 행을 그대로 받아 distinct 로 센다. 행이 크게
           늘어도 상한 10,000 이면 충분하고 초과 시 숫자를 생략하는 쪽으로
           떨어진다(아래 regionSet.size 검증). */
        sb.from("market_region_price").select("region_id").limit(10000),
      ]);
      const regionSet = new Set(
        ((regionRows.data as Array<{ region_id: string }> | null) ?? []).map(
          (r) => r.region_id,
        ),
      );
      if (regionRows.error) throw new Error(regionRows.error.message);
      return { complexes, regions: regionSet.size > 0 ? regionSet.size : null };
    }),
    10_000,
  );
  if (run.state === "ok") return run.value;
  logger.warn(
    "[coverage] 커버리지 집계를 읽지 못했습니다 — 숫자 없이 렌더합니다:",
    run.state === "error" ? run.error : "시간 초과",
  );
  return { regions: null, complexes: null };
}
