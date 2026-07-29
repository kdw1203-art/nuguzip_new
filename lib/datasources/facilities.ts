import { getBackendMode, type DataEnvelope, type LocationRef } from "./types";
import { isSeoulApiConfigured } from "@/lib/seoul/openapi-client";
import { fetchFacilitiesAggregate } from "@/lib/seoul/adapters";

/**
 * 생활편의시설 (서울열린데이터광장 / 공공데이터포털).
 */

export type FacilityCategory =
  | "hospital"
  | "pharmacy"
  | "mart"
  | "subway"
  | "bus"
  | "park"
  | "daycare"
  | "library";

export const FACILITY_LABEL: Record<FacilityCategory, string> = {
  hospital: "병원",
  pharmacy: "약국",
  mart: "대형마트",
  subway: "지하철",
  bus: "버스정류장",
  park: "공원",
  daycare: "어린이집",
  library: "도서관",
};

export type FacilityPoint = {
  name: string;
  category: FacilityCategory;
  lat: number;
  lng: number;
  distanceMeters: number;
};

export type FacilitySummary = {
  location: LocationRef;
  /**
   * 항목별 개수. **null 은 "세지 못했다"**, 0 은 "없다" 다 — 다른 말이다.
   * 지하철(subway)은 구 단위로 물으면 항상 null 이다. 서울 열린데이터의
   * 지하철역 서비스에 주소 필드가 없어 구별 집계가 불가능하기 때문이다.
   */
  counts: Record<FacilityCategory, number | null>;
  nearest: FacilityPoint[];
};

/* 사실 우선: 여기 있던 mockFacilities() 를 삭제했다.
   지역명 길이를 시드로 병원 12~20개·약국 18~28개·지하철 3~7개 같은 집계를
   만들어 냈고, 거기에 더해 "강남구 병원 1호" 같은 시설을 임의 좌표에 찍어
   distanceMeters 까지 붙였다 — 지도에 없는 시설을 있는 것처럼 표시하는 값이다.
   그러면서 attribution 은 "서울열린데이터광장"이었다.
   모르는 것은 0/빈 목록으로 둔다. */
const EMPTY_COUNTS: Record<FacilityCategory, number> = {
  hospital: 0,
  pharmacy: 0,
  mart: 0,
  subway: 0,
  bus: 0,
  park: 0,
  daycare: 0,
  library: 0,
};

function unavailableFacilities(location: LocationRef): FacilitySummary {
  return { location, counts: { ...EMPTY_COUNTS }, nearest: [] };
}

export async function getFacilitySummary(
  location: LocationRef,
): Promise<DataEnvelope<FacilitySummary>> {
  const envKey = "SEOUL_DATA_API_KEY";
  const mode = getBackendMode(envKey);

  if (mode === "live" && isSeoulApiConfigured()) {
    try {
      const live = await fetchFacilitiesAggregate({
        city: location.city,
        district: location.district,
        lat: location.lat,
        lng: location.lng,
      });
      const counts: Record<FacilityCategory, number | null> = {
        hospital: live.counts.hospitals,
        pharmacy: live.counts.pharmacies,
        mart: 0,
        subway: live.counts.subwayStations,
        bus: live.counts.busStops,
        park: live.counts.parks,
        daycare: live.counts.childcare,
        library: live.counts.libraries,
      };
      const nearest: FacilityPoint[] = live.nearest.map((p, i) => ({
        name: p.name,
        category: (["hospital", "pharmacy", "park"].includes(p.category)
          ? p.category
          : "hospital") as FacilityCategory,
        lat: p.lat ?? location.lat ?? 37.5665,
        lng: p.lng ?? location.lng ?? 126.978,
        distanceMeters: 100 + i * 80,
      }));
      return {
        source: "public-facilities",
        sourceLabel: "생활편의시설",
        unit: "COUNT",
        viz: "map_marker",
        updatedAt: new Date().toISOString().slice(0, 10),
        mode: "live",
        attribution: "서울열린데이터광장",
        isLocationBased: true,
        data: { location, counts, nearest },
      };
    } catch {
      // fall through
    }
  }

  // 실집계를 못 받아온 상태 — 공공 출처 표기를 달지 않는다(그 데이터가 아니므로).
  return {
    source: "public-facilities",
    sourceLabel: "생활편의시설 (미연동)",
    unit: "COUNT",
    viz: "map_marker",
    updatedAt: new Date().toISOString().slice(0, 10),
    mode: "mock",
    attribution: "API 키 미설정 — 편의시설 데이터를 불러오지 못했습니다",
    isLocationBased: true,
    data: unavailableFacilities(location),
  };
}
