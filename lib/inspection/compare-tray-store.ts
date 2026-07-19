/** 비교 후보 2~4개 임시 보관 — localStorage */

export type CompareTrayItem = {
  id: string;
  label: string;
  district?: string;
  sessionId?: string;
};

const KEY = "nuguzip-compare-tray";
const MAX = 4;

export function readCompareTray(): CompareTrayItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CompareTrayItem[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function writeCompareTray(items: CompareTrayItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  window.dispatchEvent(new CustomEvent("nuguzip:compare-tray"));
}

export function addCompareTrayItem(item: CompareTrayItem): CompareTrayItem[] {
  const prev = readCompareTray().filter((x) => x.id !== item.id);
  const next = [...prev, item].slice(-MAX);
  writeCompareTray(next);
  return next;
}

export function removeCompareTrayItem(id: string): CompareTrayItem[] {
  const next = readCompareTray().filter((x) => x.id !== id);
  writeCompareTray(next);
  return next;
}

export function clearCompareTray() {
  writeCompareTray([]);
}
