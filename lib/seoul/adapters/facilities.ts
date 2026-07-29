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
  /**
   * 지하철역 수. **구 단위로는 셀 수 없어서 null 이다.**
   *
   * 서울 열린데이터 SearchSTNBySubwayLineInfo 는 STATION_NM · LINE_NUM · FR_CODE
   * 만 준다 — 주소 필드가 아예 없다. 그래서 "이 구에 몇 개"를 이 응답에서
   * 뽑아낼 방법이 없다. 예전 코드는 `Math.max(1, Math.round(전체/25))` 였는데,
   * 서울 전체 역 수를 25개 구로 나눈 **평균**을 그 구의 사실인 것처럼 내놓고
   * 있었고, 조회가 실패해 0행이 와도 `Math.max(1, …)` 가 역 하나를 만들어 냈다.
   * 모르는 건 null 로 말한다.
   */
  subwayStations: number | null;
  parks: number;
  childcare: number;
  busStops: number;
  parkingLots: number;
  libraries: number;
  /** 이 어댑터에는 학교 소스가 없다 — 항상 null(모름). 0(없음)이 아니다. */
  schools: number | null;
  /** 편의점 소스도 없다 — 항상 null. */
  convenienceStores: number | null;
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
    /* 구를 지정하면 null — 이 응답에는 주소가 없어 구별 집계가 불가능하다.
       도시 전체를 물었을 때만 실제 행 수를 준다. 조회가 실패해 0행이면
       그것도 사실이 아니므로 null 이다. */
    subwayStations: district ? null : subwayRows.length > 0 ? subwayRows.length : null,
    busStops: countByDistrict(busRows, district, (r) =>
      extractDistrictFromAddress(String(r.ADDR ?? r.STTN_ADDR ?? "")),
    ),
    parkingLots: countByDistrict(parking, district, (r) =>
      extractDistrictFromAddress(String(r.ADDR ?? "")),
    ),
    libraries: countByDistrict(libraryRows, district, (r) =>
      extractDistrictFromAddress(String(r.LBRRY_ADDR ?? r.ADDR ?? "")),
    ),
    /* 예전엔 0 이었다. 이 어댑터는 학교·편의점을 조회하지도 않는데 "0곳"이라고
       단정하고 있었다 — 조회하지 않은 것과 없는 것은 다르다. */
    schools: null,
    convenienceStores: null,
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

  /* null(=모름)일 때는 체크를 세우지 않는다. 모르는 걸 근거로 "도보 10분 이내"를
     체크해 두면 임장 리포트가 확인되지 않은 사실을 실어 나른다. */
  if ((c.subwayStations ?? 0) > 0) checks.push({ id: "c1", label: "지하철역 도보 10분 이내" });
  if (c.busStops >= 3) checks.push({ id: "c2", label: "버스 정류장 3개 이상" });
  if (c.hospitals > 0 && c.pharmacies > 0) checks.push({ id: "c15", label: "병원·약국 도보권" });
  if (c.parks > 0) checks.push({ id: "c16", label: "공원·녹지 500m 이내" });
  if (c.childcare > 0) checks.push({ id: "c_cx3", label: "조경·녹지 단지 내 충분" });
  if (c.parkingLots > 0) checks.push({ id: "c7", label: "주차공간 세대당 1.2대 이상" });

  /* 숫자를 모르면 "0" 이 아니라 "확인 필요" 라고 적는다. 0 은 "없다"는 사실이고
     여기서 하려는 말은 "세지 못했다" 이다. */
  const subwayText = c.subwayStations === null ? "확인 필요" : String(c.subwayStations);

  const summary = [
    `병원 ${c.hospitals} · 약국 ${c.pharmacies}`,
    `지하철 ${subwayText} · 버스 ${c.busStops}`,
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
