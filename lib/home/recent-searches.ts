const STORAGE_KEY = "nuguzip:recent-searches";
const MAX = 5;

export function readRecentSearches(): string[] {
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

export function addRecentSearch(query: string): string[] {
  const q = query.trim();
  if (!q || typeof window === "undefined") return readRecentSearches();
  const next = [q, ...readRecentSearches().filter((x) => x !== q)].slice(0, MAX);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}
