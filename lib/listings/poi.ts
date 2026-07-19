/**
 * 지도 오버레이용 POI(지하철역·학교) 결정적 샘플 데이터.
 *
 * 실제 교통/학군 API가 아직 없으므로 구(區) 중심 좌표를 시드로 역·학교를 **결정적으로** 생성한다.
 * 실데이터 전환 시 이 모듈의 `ALL_SUBWAY`/`ALL_SCHOOLS` 만 실제 소스로 교체하면 된다.
 */
import { SEOUL_DISTRICTS, METRO_EXPLORE_DISTRICTS } from "@/lib/map/seoul-districts";

export type PoiKind = "subway" | "school";

export interface Poi {
  id: string;
  kind: PoiKind;
  name: string;
  lat: number;
  lng: number;
  district: string;
  /** 지하철: 노선명 / 학교: 급(초·중·고) */
  meta: string;
  /** 마커 색 */
  color: string;
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUBWAY_LINES: { name: string; color: string }[] = [
  { name: "2호선", color: "#00a84d" },
  { name: "3호선", color: "#ef7c1c" },
  { name: "5호선", color: "#996cac" },
  { name: "7호선", color: "#747f00" },
  { name: "9호선", color: "#bdb092" },
  { name: "신분당선", color: "#d4003b" },
  { name: "GTX-A", color: "#9a4500" },
];

const SCHOOL_LEVELS = ["초등학교", "중학교", "고등학교"];
const SCHOOL_COLOR = "#1f9d55";

type DistrictSeed = { name: string; lat: number; lng: number };

function allDistricts(): DistrictSeed[] {
  return [...SEOUL_DISTRICTS, ...METRO_EXPLORE_DISTRICTS].map((d) => ({
    name: d.name,
    lat: d.lat,
    lng: d.lng,
  }));
}

function buildPois(): { subway: Poi[]; schools: Poi[] } {
  const subway: Poi[] = [];
  const schools: Poi[] = [];

  for (const d of allDistricts()) {
    const rnd = mulberry32(hashStr(`poi:${d.name}`));
    const stationCount = 2 + Math.floor(rnd() * 2); // 2~3
    const shortName = d.name.replace(/구$|시$/u, "");

    for (let i = 0; i < stationCount; i++) {
      const line = SUBWAY_LINES[Math.floor(rnd() * SUBWAY_LINES.length)];
      const lat = d.lat + (rnd() - 0.5) * 0.025;
      const lng = d.lng + (rnd() - 0.5) * 0.03;
      subway.push({
        id: `sub:${d.name}:${i}`,
        kind: "subway",
        name: `${shortName}${i === 0 ? "" : i === 1 ? "역" : "중앙"}역`.replace("역역", "역"),
        lat,
        lng,
        district: d.name,
        meta: line.name,
        color: line.color,
      });
    }

    const schoolCount = 2 + Math.floor(rnd() * 2); // 2~3
    for (let i = 0; i < schoolCount; i++) {
      const level = SCHOOL_LEVELS[Math.floor(rnd() * SCHOOL_LEVELS.length)];
      const lat = d.lat + (rnd() - 0.5) * 0.022;
      const lng = d.lng + (rnd() - 0.5) * 0.028;
      schools.push({
        id: `sch:${d.name}:${i}`,
        kind: "school",
        name: `${shortName}${["", "제일", "중앙", "한빛"][i] ?? ""}${level}`,
        lat,
        lng,
        district: d.name,
        meta: level,
        color: SCHOOL_COLOR,
      });
    }
  }
  return { subway, schools };
}

const built = buildPois();

export const ALL_SUBWAY: Poi[] = built.subway;
export const ALL_SCHOOLS: Poi[] = built.schools;

export interface NearestSubway {
  poi: Poi;
  distanceM: number;
  /** 도보 분(약 80m/분) */
  walkMin: number;
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 좌표에서 가장 가까운 지하철역과 도보 시간(결정적 샘플 좌표 기준) */
export function nearestSubway(lat: number, lng: number): NearestSubway | null {
  let best: NearestSubway | null = null;
  for (const p of ALL_SUBWAY) {
    const distanceM = haversineM(lat, lng, p.lat, p.lng);
    if (!best || distanceM < best.distanceM) {
      best = { poi: p, distanceM, walkMin: Math.max(1, Math.round(distanceM / 80)) };
    }
  }
  return best;
}

export interface PoiBounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

/** 영역 내 POI만 추리고 최대 개수로 제한 (마커 과다 방지) */
export function poisInBounds(pois: Poi[], bounds: PoiBounds | null, max = 40): Poi[] {
  if (!bounds) return pois.slice(0, max);
  const within = pois.filter(
    (p) =>
      p.lat >= bounds.swLat &&
      p.lat <= bounds.neLat &&
      p.lng >= bounds.swLng &&
      p.lng <= bounds.neLng,
  );
  return within.slice(0, max);
}
