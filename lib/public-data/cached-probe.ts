import { unstable_cache } from "next/cache";
import {
  getPublicDataProbeSummary,
  type PublicDataProbeSummary,
} from "@/lib/public-data/health-probe";

/** 관리자 대시보드용 — 10분 캐시 (매 렌더 live probe 방지) */
export async function getCachedPublicDataProbeSummary(): Promise<PublicDataProbeSummary> {
  return unstable_cache(
    async () => getPublicDataProbeSummary(),
    ["admin-public-data-probe"],
    { revalidate: 600 },
  )();
}

/** 공개 status·health용 — 5분 캐시 */
export async function getPublicDataProbeSummaryCached(): Promise<PublicDataProbeSummary> {
  return unstable_cache(
    async () => getPublicDataProbeSummary(),
    ["public-data-probe-v1"],
    { revalidate: 300 },
  )();
}
