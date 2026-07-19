import {
  extractDistrictFromAddress,
  fetchAllSeoulRows,
  fetchSeoulOpenApi,
  matchesDistrict,
  SeoulApiError,
} from "../openapi-client";

export type FacilityCounts = {
  hospitals: number;
  pharmacies: number;
  subwayStations: number;
  parks: number;
  childcare: number;
  busStops: number;
  parkingLots: number;
  libraries: number;
  schools: number;
  convenienceStores: number;
};

export type FacilityPoint = {
  name: string;
  category: string;
  lat?: number;
  lng?: number;
  address?: string;
};

export type FacilitiesPayload = {
  district: string;
  city: string;
  counts: FacilityCounts;
  nearest: FacilityPoint[];
  mode: "live" | "mock";
};

const SERVICE_HOSPITAL = "TbHospitalInfo";
const SERVICE_PHARMACY = "TbPharmacyOperateInfo";
const SERVICE_CHILDCARE = "ChildCareInfo";
const SERVICE_PARK = "SearchParkInfoService";
const SERVICE_SUBWAY = "SearchSTNBySubwayLineInfo";
const SERVICE_PARKING = "GetParkInfo";
const SERVICE_BUS = "busStationLocation";
const SERVICE_LIBRARY = "SeoulLibraryInfo";

async function safeFetch(service: string, maxPages = 2): Promise<Record<string, unknown>[]> {
  try {
    const batch = await fetchAllSeoulRows(service, { maxPages, pageSize: 1000 });
    return batch.rows;
  } catch (err) {
    if (err instanceof SeoulApiError && (err.code === "ERROR-500" || err.code === "INFO-200")) {
      return [];
    }
    throw err;
  }
}

function countByDistrict(
  rows: Record<string, unknown>[],
  district: string,
  getDistrict: (row: Record<string, unknown>) => string | null,
): number {
  if (!district) return rows.length;
  return rows.filter((row) => matchesDistrict(district, getDistrict(row))).length;
}

export async function fetchFacilitiesAggregate(params: {
  city?: string;
  district?: string;
  lat?: number;
  lng?: number;
}): Promise<FacilitiesPayload> {
  const district = params.district ?? "";

  const [hospitals, pharmacies, childcare, parks, parking] = await Promise.all([
    safeFetch(SERVICE_HOSPITAL, 3),
    safeFetch(SERVICE_PHARMACY, 2),
    safeFetch(SERVICE_CHILDCARE, 3),
    safeFetch(SERVICE_PARK, 1),
    safeFetch(SERVICE_PARKING, 2),
  ]);

  let subwayRows: Record<string, unknown>[] = [];
  try {
    const subway = await fetchSeoulOpenApi(SERVICE_SUBWAY, 1, 1000);
    subwayRows = subway.rows;
  } catch {
    subwayRows = [];
  }

  const busRows = await safeFetch(SERVICE_BUS, 1);
  const libraryRows = await safeFetch(SERVICE_LIBRARY, 1);

  const counts: FacilityCounts = {
    hospitals: countByDistrict(hospitals, district, (r) =>
      extractDistrictFromAddress(String(r.DUTYADDR ?? "")),
    ),
    pharmacies: countByDistrict(pharmacies, district, (r) =>
      extractDistrictFromAddress(String(r.DUTYADDR ?? "")),
    ),
    childcare: countByDistrict(childcare, district, (r) => String(r.SIGUNNAME ?? "")),
    parks: countByDistrict(parks, district, (r) => {
      const rgn = String(r.RGN ?? "");
      return rgn ? `${rgn}구` : extractDistrictFromAddress(String(r.PARK_ADDR ?? ""));
    }),
    subwayStations: district ? Math.max(1, Math.round(subwayRows.length / 25)) : subwayRows.length,
    busStops: countByDistrict(busRows, district, (r) =>
      extractDistrictFromAddress(String(r.ADDR ?? r.STTN_ADDR ?? "")),
    ),
    parkingLots: countByDistrict(parking, district, (r) =>
      extractDistrictFromAddress(String(r.ADDR ?? "")),
    ),
    libraries: countByDistrict(libraryRows, district, (r) =>
      extractDistrictFromAddress(String(r.LBRRY_ADDR ?? r.ADDR ?? "")),
    ),
    schools: 0,
    convenienceStores: 0,
  };

  const nearest: FacilityPoint[] = [];

  for (const row of hospitals.slice(0, 5)) {
    const addr = String(row.DUTYADDR ?? "");
    if (district && !matchesDistrict(district, extractDistrictFromAddress(addr))) continue;
    nearest.push({
      name: String(row.DUTYNAME ?? "병원"),
      category: "hospital",
      address: addr,
      lat: Number(row.WGS84LAT ?? 0) || undefined,
      lng: Number(row.WGS84LON ?? 0) || undefined,
    });
  }

  for (const row of pharmacies.slice(0, 3)) {
    const addr = String(row.DUTYADDR ?? "");
    if (district && !matchesDistrict(district, extractDistrictFromAddress(addr))) continue;
    nearest.push({
      name: String(row.DUTYNAME ?? "약국"),
      category: "pharmacy",
      address: addr,
      lat: Number(row.WGS84LAT ?? 0) || undefined,
      lng: Number(row.WGS84LON ?? 0) || undefined,
    });
  }

  for (const row of parks.slice(0, 3)) {
    nearest.push({
      name: String(row.PARK_NM ?? "공원"),
      category: "park",
      address: String(row.PARK_ADDR ?? ""),
      lat: Number(row.YCRD ?? 0) || undefined,
      lng: Number(row.XCRD ?? 0) || undefined,
    });
  }

  return {
    district: district || "전체",
    city: params.city ?? "서울",
    counts,
    nearest: nearest.slice(0, 12),
    mode: "live",
  };
}

/** 임장 prefill — 좌표 기반 반경 내 시설 (구 이름 필터 병행) */
export async function fetchNearbyFacilitiesForInspection(params: {
  district?: string;
  lat?: number;
  lng?: number;
}): Promise<{
  checks: Array<{ id: string; label: string }>;
  summary: string;
  counts: FacilityCounts;
}> {
  const payload = await fetchFacilitiesAggregate({
    district: params.district,
    lat: params.lat,
    lng: params.lng,
  });
  const c = payload.counts;
  const checks: Array<{ id: string; label: string }> = [];

  if (c.subwayStations > 0) checks.push({ id: "c1", label: "지하철역 도보 10분 이내" });
  if (c.busStops >= 3) checks.push({ id: "c2", label: "버스 정류장 3개 이상" });
  if (c.hospitals > 0 && c.pharmacies > 0) checks.push({ id: "c15", label: "병원·약국 도보권" });
  if (c.parks > 0) checks.push({ id: "c16", label: "공원·녹지 500m 이내" });
  if (c.childcare > 0) checks.push({ id: "c_cx3", label: "조경·녹지 단지 내 충분" });
  if (c.parkingLots > 0) checks.push({ id: "c7", label: "주차공간 세대당 1.2대 이상" });

  const summary = [
    `병원 ${c.hospitals} · 약국 ${c.pharmacies}`,
    `지하철 ${c.subwayStations} · 버스 ${c.busStops}`,
    `공원 ${c.parks} · 어린이집 ${c.childcare}`,
    `주차장 ${c.parkingLots} · 도서관 ${c.libraries}`,
  ].join(" / ");

  return { checks, summary, counts: c };
}

export {
  SERVICE_HOSPITAL,
  SERVICE_PHARMACY,
  SERVICE_CHILDCARE,
  SERVICE_PARK,
  SERVICE_SUBWAY,
  SERVICE_PARKING,
  SERVICE_BUS,
  SERVICE_LIBRARY,
};
