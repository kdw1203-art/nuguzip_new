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
    const data = (await res.json()) as { regions?: UserRegion[]; stored?: boolean };
    /* stored:false 는 "서버에 저장소가 없어서 못 읽었다"는 뜻이지 "등록한 지역이
       없다"가 아니다. 그때 내려오는 빈 배열을 로컬에 덮어쓰면 이 기기에 남아 있던
       관심 지역이 지워진다. 서버가 실제로 읽었을 때만 로컬을 갱신한다. */
    if (Array.isArray(data.regions) && data.stored) {
      writeUserRegionsLocal(data.regions);
      return data.regions;
    }
  } catch {
    /* local fallback */
  }
  return readUserRegionsLocal();
}
