import { NATIONAL_PLAN_FETCHERS, NATIONAL_PLAN_IDS } from "@/lib/national-data/adapters";
import type { NationalPlanFetchResult, NationalPlanQuery } from "@/lib/national-data/types";
import { getNationalPlanById } from "@/lib/public-data/national-utilization-catalog";

const memCache = new Map<string, { data: NationalPlanFetchResult; expiresAt: number }>();

function cacheKey(planId: string, query: NationalPlanQuery): string {
  return `${planId}:${JSON.stringify(query)}`;
}

export async function fetchNationalPlan(
  planId: string,
  query: NationalPlanQuery = {},
): Promise<NationalPlanFetchResult> {
  const plan = getNationalPlanById(planId);
  if (!plan) {
    throw new Error(`Unknown national plan: ${planId}`);
  }

  const fetcher = NATIONAL_PLAN_FETCHERS[planId];
  if (!fetcher) {
    throw new Error(`No fetcher for plan: ${planId}`);
  }

  const ttlMs = plan.ttlHours * 3_600_000;
  const key = cacheKey(planId, query);
  const cached = memCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.data, meta: { ...cached.data.meta, fromCache: true } };
  }

  const result = await fetcher({
    ...query,
    limit: query.limit ?? 10,
  });

  memCache.set(key, { data: result, expiresAt: Date.now() + ttlMs });
  return result;
}

export async function fetchAllNationalPlans(query: NationalPlanQuery = {}): Promise<NationalPlanFetchResult[]> {
  const results = await Promise.allSettled(
    NATIONAL_PLAN_IDS.map((id) => fetchNationalPlan(id, { ...query, limit: 3 })),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<NationalPlanFetchResult> => r.status === "fulfilled")
    .map((r) => r.value);
}

export { NATIONAL_PLAN_IDS };
