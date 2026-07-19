/**
 * R-ONE CLS_FULLNM / KB 지역명 → 내부 지역(id/name/city) 매핑.
 * R-ONE CLS_FULLNM 예: "서울>강남구", "경기>경부1권>안양시>만안구", "인천>연수구", "전북>전주시"
 */
import { SEOUL_DISTRICTS, METRO_EXPLORE_DISTRICTS } from "@/lib/map/seoul-districts";

export interface RegionMatch {
  id: string;
  name: string;
  city: string;
}

interface InternalRegion {
  id: string;
  name: string;
  city: string;
}

const INTERNAL_REGIONS: InternalRegion[] = [
  ...SEOUL_DISTRICTS.map((d) => ({ id: d.id, name: d.name, city: d.city ?? "서울" })),
  ...METRO_EXPLORE_DISTRICTS.map((d) => ({ id: d.id, name: d.name, city: d.city ?? "서울" })),
];

function stripSpaces(s: string): string {
  return s.replace(/\s+/g, "");
}

/** CLS_FULLNM 의 시도 표기를 내부 city 로 정규화 */
function normalizeSido(sido: string): string {
  const s = sido.trim();
  if (s.startsWith("서울")) return "서울";
  if (s.startsWith("경기")) return "경기";
  if (s.startsWith("인천")) return "인천";
  if (s.startsWith("부산")) return "부산";
  if (s.startsWith("대구")) return "대구";
  if (s.startsWith("대전")) return "대전";
  if (s.startsWith("광주")) return "광주";
  if (s.startsWith("울산")) return "울산";
  if (s.startsWith("세종")) return "세종";
  return s;
}

/**
 * R-ONE CLS_FULLNM 에서 내부 지역을 찾는다. 매칭 실패 시 null (해당 지역은 스킵).
 */
export function matchRegionFromClsFullNm(clsFullNm: string | null | undefined): RegionMatch | null {
  if (!clsFullNm) return null;
  const segments = clsFullNm
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length < 2) return null;

  const city = normalizeSido(segments[0]);
  // 권역(예: 경부1권) 세그먼트 제거 후 시/구 조합
  const meaningful = segments.slice(1).filter((s) => !s.endsWith("권"));
  if (meaningful.length === 0) return null;
  const candidate = meaningful.join(" ");
  const candidateTight = stripSpaces(candidate);
  const lastSeg = meaningful[meaningful.length - 1];

  for (const r of INTERNAL_REGIONS) {
    if (r.city !== city) continue;
    const nameTight = stripSpaces(r.name);
    if (nameTight === candidateTight) return { id: r.id, name: r.name, city: r.city };
    // 인천 중구("인천 중구") ↔ CLS "인천>중구"(candidate "중구") 등 보정
    if (nameTight.endsWith(stripSpaces(lastSeg)) && nameTight.length - stripSpaces(lastSeg).length <= 4) {
      return { id: r.id, name: r.name, city: r.city };
    }
  }
  return null;
}

/** KB 지역명(예: "강남구", "분당구", "수원 영통구")에서 내부 지역 추정 */
export function matchRegionByName(name: string, cityHint?: string): RegionMatch | null {
  const tight = stripSpaces(name);
  // 1차: city 힌트 + 정확 매칭
  for (const r of INTERNAL_REGIONS) {
    if (cityHint && r.city !== cityHint) continue;
    if (stripSpaces(r.name) === tight) return { id: r.id, name: r.name, city: r.city };
  }
  // 2차: 부분 포함(구 단위)
  for (const r of INTERNAL_REGIONS) {
    const nt = stripSpaces(r.name);
    if (nt === tight || nt.endsWith(tight) || tight.endsWith(nt)) {
      return { id: r.id, name: r.name, city: r.city };
    }
  }
  return null;
}
