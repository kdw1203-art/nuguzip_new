/** 임장 허브·AI 분석 → RoutePlanner 세션 시드 (sessionStorage, 1회 소비) */

export type RoutePlannerSeedStop = {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
  priority?: number;
};

const STORAGE_KEY = "woodong:route-planner-seed";

export function saveRoutePlannerSeed(stops: RoutePlannerSeedStop[]): void {
  if (typeof window === "undefined" || stops.length === 0) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stops));
  } catch {
    /* quota / private mode */
  }
}

export function consumeRoutePlannerSeed(): RoutePlannerSeedStop[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RoutePlannerSeedStop[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}
