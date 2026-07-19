/** 최근 본 단지 — compare tray·홈·지도 연동 */

export type RecentComplexItem = {
  id: string;
  label: string;
  href: string;
  district?: string;
  viewedAt: number;
};

const KEY = "nuguzip-recent-complexes";
const MAX = 8;

export function readRecentComplexes(): RecentComplexItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentComplexItem[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(items: RecentComplexItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  window.dispatchEvent(new CustomEvent("nuguzip:recent-complexes"));
}

export function addRecentComplex(item: Omit<RecentComplexItem, "viewedAt">) {
  const prev = readRecentComplexes().filter((x) => x.id !== item.id);
  const next = [{ ...item, viewedAt: Date.now() }, ...prev].slice(0, MAX);
  write(next);
  return next;
}

export function clearRecentComplexes() {
  write([]);
}
