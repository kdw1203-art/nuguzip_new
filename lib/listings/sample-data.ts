/**
 * 단지·매물 샘플 데이터 (결정적 생성).
 *
 * 실제 중개 매물 API/DB가 아직 없으므로, 구(區) 중심 좌표(`SEOUL_DISTRICTS`)를
 * 시드로 단지별 좌표·매물(거래유형·가격·면적·방·화장실·입주일)을 **결정적으로** 생성한다.
 * `Math.random()` 대신 시드 RNG를 써서 SSR/CSR 결과가 동일하다(hydration mismatch 방지).
 *
 * 실데이터 전환 시: 이 모듈의 `ALL_LISTINGS` / `ALL_COMPLEXES` 만 실제 소스로 교체하면
 * 필터(`lib/listings/filter.ts`)·지도 UI는 그대로 동작한다.
 */
import { SEOUL_DISTRICTS, METRO_EXPLORE_DISTRICTS, type SeoulDistrictInfo } from "@/lib/map/seoul-districts";

export type TradeType = "매매" | "전세" | "월세";
export type BuildingType = "아파트" | "오피스텔" | "빌라";

export interface Listing {
  id: string;
  complexId: string;
  complexName: string;
  city: string;
  district: string;
  lat: number;
  lng: number;
  tradeType: TradeType;
  /** 건물 유형 */
  buildingType: BuildingType;
  /** 매매가 / 전세보증금 / 월세보증금 (원) */
  priceKrw: number;
  /** 월세일 때 월 임대료(원), 그 외 0 */
  monthlyRentKrw: number;
  areaM2: number;
  pyeong: number;
  /** 방 개수 (1~5) */
  rooms: number;
  /** 화장실 개수 (1~3) */
  bathrooms: number;
  floor: number;
  totalFloors: number;
  /** 입주 가능일 (YYYY-MM-DD) */
  moveInDate: string;
  buildYear: number;
  /** 단지 세대수 */
  households: number;
  /** 세대당 주차대수 */
  parkingPerHousehold: number;
}

export interface ComplexInfo {
  id: string;
  name: string;
  city: string;
  district: string;
  lat: number;
  lng: number;
  buildingType: BuildingType;
  buildYear: number;
  totalFloors: number;
  households: number;
  parkingPerHousehold: number;
}

const M2_PER_PYEONG = 3.305785;

/** 문자열 → 32bit 해시 (FNV-1a) */
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 결정적 의사난수 생성기 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)] ?? arr[0];
}

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

const BRANDS = [
  "래미안",
  "자이",
  "푸르지오",
  "e편한세상",
  "롯데캐슬",
  "힐스테이트",
  "아이파크",
  "더샵",
  "센트레빌",
  "한신더휴",
] as const;

const MODIFIERS = ["", "", "센트럴", "파크", "리버", "스카이", "포레", "퍼스트", "더퍼스트", "프레스티지"] as const;

/** 전용면적 후보(㎡) — 방/화장실 산정의 기준 */
const AREA_SET = [39, 49, 59, 74, 84, 99, 114, 134, 152] as const;

/** 입주 가능일 기준 앵커(고정) — Date.now() 의존 제거로 결정적 */
const MOVE_IN_ANCHOR = Date.UTC(2026, 5, 1); // 2026-06-01

function moveInDateFor(rng: () => number): string {
  const days = randInt(rng, 0, 240);
  const d = new Date(MOVE_IN_ANCHOR + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function roomsForArea(areaM2: number, rng: () => number): number {
  if (areaM2 < 45) return 1;
  if (areaM2 < 60) return randInt(rng, 1, 2);
  if (areaM2 < 85) return 3;
  if (areaM2 < 115) return randInt(rng, 3, 4);
  return randInt(rng, 4, 5);
}

function bathroomsForArea(areaM2: number, rng: () => number): number {
  if (areaM2 < 60) return 1;
  if (areaM2 < 115) return randInt(rng, 1, 2);
  return randInt(rng, 2, 3);
}

/** 거래유형 가중 추첨 (매매 50% / 전세 30% / 월세 20%) */
function tradeTypeFor(rng: () => number): TradeType {
  const r = rng();
  if (r < 0.5) return "매매";
  if (r < 0.8) return "전세";
  return "월세";
}

/** 건물 유형 가중 추첨 (아파트 78% / 오피스텔 16% / 빌라 6%) */
function buildingTypeFor(rng: () => number): BuildingType {
  const r = rng();
  if (r < 0.78) return "아파트";
  if (r < 0.94) return "오피스텔";
  return "빌라";
}

function buildComplexesForDistrict(d: SeoulDistrictInfo): ComplexInfo[] {
  const rng = mulberry32(hashStr(`complex:${d.id}`));
  const city = d.city ?? "서울";
  const count = randInt(rng, 4, 8);
  const complexes: ComplexInfo[] = [];
  for (let i = 0; i < count; i++) {
    const brand = pick(rng, BRANDS);
    const mod = pick(rng, MODIFIERS);
    const name = `${d.name.replace(/(구|시)$/u, "")} ${brand}${mod ? ` ${mod}` : ""} ${i + 1}단지`.replace(/\s+/g, " ").trim();
    // 구 중심 좌표 주변으로 분산 (대략 ±1.3km)
    const lat = d.lat + (rng() - 0.5) * 0.024;
    const lng = d.lng + (rng() - 0.5) * 0.03;
    const buildingType = buildingTypeFor(rng);
    const buildYear = randInt(rng, 1998, 2024);
    const totalFloors = randInt(rng, 12, 35);
    const households = randInt(rng, 180, 2400);
    const parkingPerHousehold = Number((0.6 + rng() * 1.4).toFixed(1)); // 0.6~2.0
    complexes.push({
      id: `${d.id}-c${i + 1}`,
      name,
      city,
      district: d.name,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      buildingType,
      buildYear,
      totalFloors,
      households,
      parkingPerHousehold,
    });
  }
  return complexes;
}

function buildListingsForComplex(c: ComplexInfo, basePricePerM2: number): Listing[] {
  const rng = mulberry32(hashStr(`listing:${c.id}`));
  const count = randInt(rng, 2, 7);
  const listings: Listing[] = [];
  for (let i = 0; i < count; i++) {
    const areaM2 = pick(rng, AREA_SET);
    const tradeType = tradeTypeFor(rng);
    const rooms = roomsForArea(areaM2, rng);
    const bathrooms = bathroomsForArea(areaM2, rng);
    const floor = randInt(rng, 1, c.totalFloors);
    // 면적·층·가격 변동(±12%) 반영한 매매 기준가
    const floorAdj = 1 + (floor / c.totalFloors - 0.5) * 0.06;
    const variance = 0.88 + rng() * 0.24;
    const saleWon = Math.round((basePricePerM2 * areaM2 * floorAdj * variance) / 1_000_000) * 1_000_000;

    let priceKrw = saleWon;
    let monthlyRentKrw = 0;
    if (tradeType === "전세") {
      priceKrw = Math.round((saleWon * (0.55 + rng() * 0.2)) / 1_000_000) * 1_000_000;
    } else if (tradeType === "월세") {
      priceKrw = Math.round((saleWon * (0.08 + rng() * 0.17)) / 1_000_000) * 1_000_000; // 보증금
      monthlyRentKrw = Math.round((saleWon * (0.0009 + rng() * 0.0011)) / 10_000) * 10_000; // 월 임대료
    }

    listings.push({
      id: `${c.id}-l${i + 1}`,
      complexId: c.id,
      complexName: c.name,
      city: c.city,
      district: c.district,
      lat: c.lat,
      lng: c.lng,
      tradeType,
      buildingType: c.buildingType,
      priceKrw,
      monthlyRentKrw,
      areaM2,
      pyeong: Math.round(areaM2 / M2_PER_PYEONG),
      rooms,
      bathrooms,
      floor,
      totalFloors: c.totalFloors,
      moveInDate: moveInDateFor(rng),
      buildYear: c.buildYear,
      households: c.households,
      parkingPerHousehold: c.parkingPerHousehold,
    });
  }
  return listings;
}

function buildAll(): { complexes: ComplexInfo[]; listings: Listing[] } {
  const districts = [...SEOUL_DISTRICTS, ...METRO_EXPLORE_DISTRICTS];
  const complexes: ComplexInfo[] = [];
  const listings: Listing[] = [];
  for (const d of districts) {
    const basePricePerM2 = d.avgPricePerM2 ?? 10_000_000;
    const cs = buildComplexesForDistrict(d);
    for (const c of cs) {
      complexes.push(c);
      listings.push(...buildListingsForComplex(c, basePricePerM2));
    }
  }
  return { complexes, listings };
}

const built = buildAll();

export const ALL_COMPLEXES: ComplexInfo[] = built.complexes;
export const ALL_LISTINGS: Listing[] = built.listings;

export interface PriceBound {
  min: number;
  max: number;
  step: number;
}

/** 거래유형별 가격 범위 슬라이더 경계 (데이터 실측 최대값을 step 단위로 올림) */
function computePriceBounds(): Record<TradeType, PriceBound> {
  const steps: Record<TradeType, number> = {
    매매: 50_000_000,
    전세: 25_000_000,
    월세: 5_000_000,
  };
  const maxByType: Record<TradeType, number> = { 매매: 0, 전세: 0, 월세: 0 };
  for (const l of ALL_LISTINGS) {
    if (l.priceKrw > maxByType[l.tradeType]) maxByType[l.tradeType] = l.priceKrw;
  }
  const out = {} as Record<TradeType, PriceBound>;
  (["매매", "전세", "월세"] as TradeType[]).forEach((t) => {
    const step = steps[t];
    const max = Math.max(step, Math.ceil((maxByType[t] || step) / step) * step);
    out[t] = { min: 0, max, step };
  });
  return out;
}

export const PRICE_BOUNDS: Record<TradeType, PriceBound> = computePriceBounds();

/** 도시 목록 (필터 탭용) */
export const LISTING_CITIES: string[] = Array.from(new Set(ALL_COMPLEXES.map((c) => c.city)));

/** 도시별 구 목록 */
export function districtsForCity(city: string): string[] {
  const set = new Set(
    ALL_COMPLEXES.filter((c) => city === "전체" || c.city === city).map((c) => c.district),
  );
  return Array.from(set);
}
