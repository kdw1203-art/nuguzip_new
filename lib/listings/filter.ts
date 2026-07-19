/**
 * 매물 필터 로직 (순수 함수) — 지도 마커와 목록이 공유한다.
 */
import {
  ALL_LISTINGS,
  PRICE_BOUNDS,
  type BuildingType,
  type Listing,
  type TradeType,
} from "@/lib/listings/sample-data";

export type MoveInId = "all" | "immediate" | "m3" | "m6";
export type HouseholdId = "all" | "small" | "mid" | "large";
export type BuildingAgeId = "all" | "y5" | "y10" | "y10_20" | "y20";

/** 입주년차 계산 기준 연도 (결정적) */
export const REFERENCE_YEAR = 2026;

export interface PriceRange {
  label: string;
  min: number;
  max: number;
}

export interface ListingFilters {
  tradeType: TradeType;
  /** "전체" 또는 건물 유형 */
  buildingType: "전체" | BuildingType;
  city: string; // "전체" 또는 도시명
  district: string; // "전체" 또는 구명
  query: string;
  /** 가격 범위(원) — 슬라이더 */
  priceMin: number;
  priceMax: number;
  /** 평형 프리셋 인덱스 */
  pyeongIdx: number;
  /** 선택된 방 개수 (빈 배열=전체). 4는 "4개 이상" */
  rooms: number[];
  /** 선택된 화장실 개수 (빈 배열=전체). 3은 "3개 이상" */
  bathrooms: number[];
  moveIn: MoveInId;
  /** 세대수(단지 규모) */
  households: HouseholdId;
  /** 입주년차 */
  buildingAge: BuildingAgeId;
  /** 세대당 주차 1대 이상 */
  parking: boolean;
}

const INF = Number.POSITIVE_INFINITY;

export const BUILDING_TYPE_OPTIONS: ("전체" | BuildingType)[] = ["전체", "아파트", "오피스텔", "빌라"];

/** 평형(전용) 프리셋 */
export const PYEONG_RANGES: PriceRange[] = [
  { label: "전체", min: 0, max: INF },
  { label: "10평대", min: 10, max: 19 },
  { label: "20평대", min: 20, max: 29 },
  { label: "30평대", min: 30, max: 39 },
  { label: "40평대+", min: 40, max: INF },
];

export const ROOM_OPTIONS = [1, 2, 3, 4] as const; // 4 = 4개 이상
export const BATHROOM_OPTIONS = [1, 2, 3] as const; // 3 = 3개 이상

export const MOVE_IN_OPTIONS: { id: MoveInId; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "immediate", label: "즉시입주" },
  { id: "m3", label: "3개월 내" },
  { id: "m6", label: "6개월 내" },
];

export const HOUSEHOLD_OPTIONS: { id: HouseholdId; label: string; min: number; max: number }[] = [
  { id: "all", label: "전체", min: 0, max: INF },
  { id: "small", label: "300세대 미만", min: 0, max: 299 },
  { id: "mid", label: "300~1000세대", min: 300, max: 999 },
  { id: "large", label: "1000세대 이상", min: 1000, max: INF },
];

export const BUILDING_AGE_OPTIONS: { id: BuildingAgeId; label: string; min: number; max: number }[] = [
  { id: "all", label: "전체", min: 0, max: INF },
  { id: "y5", label: "5년 이내", min: 0, max: 5 },
  { id: "y10", label: "10년 이내", min: 0, max: 10 },
  { id: "y10_20", label: "10~20년", min: 10, max: 20 },
  { id: "y20", label: "20년 이상", min: 20, max: INF },
];

export const DEFAULT_FILTERS: ListingFilters = {
  tradeType: "매매",
  buildingType: "전체",
  city: "전체",
  district: "전체",
  query: "",
  priceMin: PRICE_BOUNDS["매매"].min,
  priceMax: PRICE_BOUNDS["매매"].max,
  pyeongIdx: 0,
  rooms: [],
  bathrooms: [],
  moveIn: "all",
  households: "all",
  buildingAge: "all",
  parking: false,
};

function matchRooms(value: number, selected: number[]): boolean {
  if (selected.length === 0) return true;
  return selected.some((s) => (s >= 4 ? value >= 4 : value === s));
}

function matchBathrooms(value: number, selected: number[]): boolean {
  if (selected.length === 0) return true;
  return selected.some((s) => (s >= 3 ? value >= 3 : value === s));
}

function matchMoveIn(moveInDate: string, moveIn: MoveInId): boolean {
  if (moveIn === "all") return true;
  const target = new Date(moveInDate).getTime();
  if (!Number.isFinite(target)) return true;
  const now = Date.now();
  const day = 86_400_000;
  if (moveIn === "immediate") return target <= now + 14 * day;
  if (moveIn === "m3") return target <= now + 90 * day;
  return target <= now + 180 * day; // m6
}

function matchHouseholds(households: number, id: HouseholdId): boolean {
  if (id === "all") return true;
  const opt = HOUSEHOLD_OPTIONS.find((o) => o.id === id);
  if (!opt) return true;
  return households >= opt.min && households <= opt.max;
}

function matchBuildingAge(buildYear: number, id: BuildingAgeId): boolean {
  if (id === "all") return true;
  const opt = BUILDING_AGE_OPTIONS.find((o) => o.id === id);
  if (!opt) return true;
  const age = REFERENCE_YEAR - buildYear;
  return age >= opt.min && age <= opt.max;
}

export function applyListingFilters(listings: Listing[], f: ListingFilters): Listing[] {
  const pyeongRange = PYEONG_RANGES[f.pyeongIdx] ?? PYEONG_RANGES[0];
  const q = f.query.trim();
  return listings.filter((l) => {
    if (l.tradeType !== f.tradeType) return false;
    if (f.buildingType !== "전체" && l.buildingType !== f.buildingType) return false;
    if (f.city !== "전체" && l.city !== f.city) return false;
    if (f.district !== "전체" && l.district !== f.district) return false;
    if (q && !l.complexName.includes(q) && !l.district.includes(q)) return false;
    if (l.priceKrw < f.priceMin || l.priceKrw > f.priceMax) return false;
    if (l.pyeong < pyeongRange.min || l.pyeong > pyeongRange.max) return false;
    if (!matchRooms(l.rooms, f.rooms)) return false;
    if (!matchBathrooms(l.bathrooms, f.bathrooms)) return false;
    if (!matchMoveIn(l.moveInDate, f.moveIn)) return false;
    if (!matchHouseholds(l.households, f.households)) return false;
    if (!matchBuildingAge(l.buildYear, f.buildingAge)) return false;
    if (f.parking && l.parkingPerHousehold < 1) return false;
    return true;
  });
}

export type ListingSortId =
  | "recommended"
  | "priceAsc"
  | "priceDesc"
  | "areaAsc"
  | "areaDesc"
  | "moveInSoon"
  | "perPyeongAsc";

export const LISTING_SORT_OPTIONS: { id: ListingSortId; label: string }[] = [
  { id: "recommended", label: "추천순" },
  { id: "priceAsc", label: "가격 낮은순" },
  { id: "priceDesc", label: "가격 높은순" },
  { id: "perPyeongAsc", label: "평당가 낮은순" },
  { id: "areaDesc", label: "면적 넓은순" },
  { id: "areaAsc", label: "면적 좁은순" },
  { id: "moveInSoon", label: "입주 빠른순" },
];

/** 평당가(원/평). pyeong<=0 이면 0. */
export function pricePerPyeong(l: Listing): number {
  return l.pyeong > 0 ? Math.round(l.priceKrw / l.pyeong) : 0;
}

/** 매물 정렬(순수, 비파괴). recommended는 입력(시드) 순서 유지. */
export function sortListings(listings: Listing[], sort: ListingSortId): Listing[] {
  const arr = [...listings];
  switch (sort) {
    case "priceAsc":
      return arr.sort((a, b) => a.priceKrw - b.priceKrw);
    case "priceDesc":
      return arr.sort((a, b) => b.priceKrw - a.priceKrw);
    case "areaAsc":
      return arr.sort((a, b) => a.pyeong - b.pyeong);
    case "areaDesc":
      return arr.sort((a, b) => b.pyeong - a.pyeong);
    case "perPyeongAsc":
      return arr.sort((a, b) => pricePerPyeong(a) - pricePerPyeong(b));
    case "moveInSoon":
      return arr.sort(
        (a, b) =>
          new Date(a.moveInDate).getTime() - new Date(b.moveInDate).getTime(),
      );
    default:
      return arr;
  }
}

/** 단지 밸류에이션(전세가율·갭) — 매매/전세 최저가 기준, 결정적. */
export interface ComplexValuation {
  minSale: number;
  minJeonse: number;
  /** 전세가율(%) = 전세 최저 / 매매 최저 */
  jeonseRatio: number;
  /** 갭(원) = 매매 최저 − 전세 최저 */
  gap: number;
}

const VALUATION_CACHE = new Map<string, ComplexValuation>();

export function complexValuation(complexId: string): ComplexValuation {
  const cached = VALUATION_CACHE.get(complexId);
  if (cached) return cached;
  const items = ALL_LISTINGS.filter((l) => l.complexId === complexId);
  const sale = items.filter((l) => l.tradeType === "매매").map((l) => l.priceKrw);
  const jeonse = items.filter((l) => l.tradeType === "전세").map((l) => l.priceKrw);
  const minSale = sale.length ? Math.min(...sale) : 0;
  const minJeonse = jeonse.length ? Math.min(...jeonse) : 0;
  const jeonseRatio = minSale && minJeonse ? Math.round((minJeonse / minSale) * 100) : 0;
  const gap = minSale && minJeonse ? minSale - minJeonse : 0;
  const v: ComplexValuation = { minSale, minJeonse, jeonseRatio, gap };
  VALUATION_CACHE.set(complexId, v);
  return v;
}

export type GapFilterId = "all" | "ratio70" | "ratio80" | "gap30000" | "gap10000";

export const GAP_FILTER_OPTIONS: { id: GapFilterId; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "ratio70", label: "전세가율 70%+" },
  { id: "ratio80", label: "전세가율 80%+" },
  { id: "gap30000", label: "갭 3억 이하" },
  { id: "gap10000", label: "갭 1억 이하" },
];

export function passesGapFilter(v: ComplexValuation, id: GapFilterId): boolean {
  if (id === "all") return true;
  if (!v.minSale || !v.minJeonse) return false;
  if (id === "ratio70") return v.jeonseRatio >= 70;
  if (id === "ratio80") return v.jeonseRatio >= 80;
  if (id === "gap30000") return v.gap <= 300_000_000;
  return v.gap <= 100_000_000;
}

export interface ComplexMarker {
  complexId: string;
  complexName: string;
  city: string;
  district: string;
  lat: number;
  lng: number;
  listingCount: number;
  minPriceKrw: number;
  maxPriceKrw: number;
}

/** 필터된 매물을 단지 단위로 집계 (지도 마커용) */
export function summarizeByComplex(listings: Listing[]): ComplexMarker[] {
  const map = new Map<string, ComplexMarker>();
  for (const l of listings) {
    const cur = map.get(l.complexId);
    if (!cur) {
      map.set(l.complexId, {
        complexId: l.complexId,
        complexName: l.complexName,
        city: l.city,
        district: l.district,
        lat: l.lat,
        lng: l.lng,
        listingCount: 1,
        minPriceKrw: l.priceKrw,
        maxPriceKrw: l.priceKrw,
      });
    } else {
      cur.listingCount += 1;
      cur.minPriceKrw = Math.min(cur.minPriceKrw, l.priceKrw);
      cur.maxPriceKrw = Math.max(cur.maxPriceKrw, l.priceKrw);
    }
  }
  return Array.from(map.values());
}

/** 가격(원)을 억/만 라벨로 — 예: 12.5억, 8,500만 */
export function formatPriceKrw(won: number): string {
  if (!Number.isFinite(won) || won <= 0) return "—";
  if (won >= 100_000_000) {
    const eok = won / 100_000_000;
    return `${eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : eok.toFixed(1)}억`;
  }
  return `${Math.round(won / 10_000).toLocaleString("ko-KR")}만`;
}

/** 월세 표기 — 보증금/월 (예: 5,000만/85만) */
export function formatRentLabel(deposit: number, monthly: number): string {
  return `${formatPriceKrw(deposit)}/${formatPriceKrw(monthly)}`;
}
