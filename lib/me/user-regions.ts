/** 사용자 관심 권역 1:N — P1-02 설계 (클라이언트 캐시 + API 연동) */

export type UserRegion = {
  city: string;
  district: string;
  label?: string;
  isPrimary?: boolean;
};

const STORAGE_KEY = "woodong:user-regions";

export function readUserRegionsLocal(): UserRegion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserRegion[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeUserRegionsLocal(regions: UserRegion[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(regions.slice(0, 5)));
}

export function addUserRegionLocal(region: UserRegion): UserRegion[] {
  const current = readUserRegionsLocal();
  const key = `${region.city}|${region.district}`;
  const filtered = current.filter((r) => `${r.city}|${r.district}` !== key);
  const next = [{ ...region, isPrimary: filtered.length === 0 }, ...filtered].slice(0, 5);
  writeUserRegionsLocal(next);
  return next;
}

export async function fetchUserRegions(): Promise<UserRegion[]> {
  try {
    const res = await fetch("/api/me/regions");
    if (!res.ok) return readUserRegionsLocal();
    const data = (await res.json()) as { regions?: UserRegion[] };
    if (Array.isArray(data.regions)) {
      writeUserRegionsLocal(data.regions);
      return data.regions;
    }
  } catch {
    /* local fallback */
  }
  return readUserRegionsLocal();
}
