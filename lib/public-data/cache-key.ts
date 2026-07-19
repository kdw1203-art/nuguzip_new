import type { DataSourceId, LocationRef } from "./types";

/** `fetchPublicData` / 캐시 키와 동일 — 테스트·스냅샷·ETL에 재사용 */
export function publicDataCacheKey(
  source: DataSourceId,
  params: LocationRef & Record<string, string>,
): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v != null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return `${source}:${parts.join("&")}`;
}
