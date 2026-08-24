import { revalidatePath, revalidateTag } from "next/cache";
import { logger } from "@/lib/log";

/* [OPT-10·15] 태그·경로 기반 재검증 — "데이터가 바뀐 순간에만" 캐시를 비운다.
   시간 기반 revalidate 는 안전망으로 남고, 수집 크론이 끝나면 여기로 정확히 찌른다.
   태그는 unstable_cache(fetch 캐시)에, 경로는 ISR 페이지 HTML 에 각각 작용한다. */

export const CACHE_TAGS = {
  market: "market", // 실거래·지역 시세 계열
  supply: "supply", // 입주 물량
  news: "news", // 자동 뉴스
  economy: "economy", // 기준금리 등 거시
} as const;

const SOURCE_MAP: Record<string, { tags: string[]; paths: string[] }> = {
  molit: { tags: [CACHE_TAGS.market], paths: ["/", "/analysis", "/analysis/accuracy"] },
  reb: { tags: [CACHE_TAGS.market], paths: ["/analysis"] },
  kb: { tags: [CACHE_TAGS.market], paths: [] },
  supply: { tags: [CACHE_TAGS.supply], paths: ["/apply", "/supply"] },
  economy: { tags: [CACHE_TAGS.economy], paths: [] },
};

/** 수집 성공 직후 호출 — 실패해도 수집 결과에는 영향을 주지 않는다. */
export function invalidateAfterIngest(source: keyof typeof SOURCE_MAP | string): void {
  const plan = SOURCE_MAP[source];
  if (!plan) return;
  try {
    for (const t of plan.tags) revalidateTag(t);
    for (const p of plan.paths) revalidatePath(p);
  } catch (e) {
    logger.warn("[cache-invalidate] 재검증 실패(무시)", source, e);
  }
}
