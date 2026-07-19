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
  counts: Record<FacilityCategory, number>;
  nearest: FacilityPoint[];
};

function mockFacilities(location: LocationRef): FacilitySummary {
  const seed = `${location.city}${location.district ?? ""}`.length;
  const counts: Record<FacilityCategory, number> = {
    hospital: 12 + (seed % 9),
    pharmacy: 18 + (seed % 11),
    mart: 2 + (seed % 4),
    subway: 3 + (seed % 5),
    bus: 22 + (seed % 17),
    park: 4 + (seed % 4),
    daycare: 14 + (seed % 8),
    library: 2 + (seed % 3),
  };
  const labels: FacilityCategory[] = ["hospital", "pharmacy", "mart", "subway", "park"];
  const baseLat = location.lat ?? 37.5665;
  const baseLng = location.lng ?? 126.978;
  const nearest: FacilityPoint[] = labels.map((cat, i) => ({
    name: `${location.district ?? ""} ${FACILITY_LABEL[cat]} ${i + 1}호`,
    category: cat,
    lat: baseLat + ((seed + i) % 7) * 0.0009,
    lng: baseLng + ((seed + i) % 9) * 0.0009,
    distanceMeters: 120 + ((seed + i) % 12) * 55,
  }));
  return { location, counts, nearest };
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
      const counts: Record<FacilityCategory, number> = {
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

  return {
    source: "public-facilities",
    sourceLabel: "생활편의시설",
    unit: "COUNT",
    viz: "map_marker",
    updatedAt: new Date().toISOString().slice(0, 10),
    mode: "mock",
    attribution: "서울열린데이터광장 · 공공데이터포털",
    isLocationBased: true,
    data: mockFacilities(location),
  };
}
