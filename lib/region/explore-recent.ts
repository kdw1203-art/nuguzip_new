const STORAGE_KEY = "nuguzip:explore-recent-regions";
const MAX = 5;

export function readRecentExploreRegionIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, MAX);
  } catch {
    return [];
  }
}

export function addRecentExploreRegionId(regionId: string): string[] {
  const id = regionId.trim();
  if (!id || typeof window === "undefined") return readRecentExploreRegionIds();
  const next = [id, ...readRecentExploreRegionIds().filter((x) => x !== id)].slice(0, MAX);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}
