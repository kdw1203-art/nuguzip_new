import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* ============================================================
   [#96] 생활 인프라 — 도보권 학교·도시철도역.
   데이터: 공공데이터포털 표준데이터 2종(공공누리 1유형 — 출처 표시 후 자유 이용)
     · 전국초중등학교위치표준데이터  → poi_schools
     · 전국도시철도역사정보표준데이터 → poi_stations
   인제스트는 api.odcloud.kr 경로를 환경변수로 받는다(UDDI 가 업로드마다 바뀌는
   구조라 코드에 박지 않는다):
     POI_SCHOOLS_API_PATH  예: /api/15021148/v1/uddi:xxxxxxxx
     POI_STATIONS_API_PATH 예: /api/15041335/v1/uddi:xxxxxxxx
   serviceKey 는 청약 인제스트와 같은 DATA_GO_KR_SERVICE_KEY 를 재사용한다.
   ============================================================ */

export type NearbySchool = {
  name: string;
  category: string | null;
  distanceM: number;
};
export type NearbyStation = {
  name: string;
  line: string | null;
  distanceM: number;
};
export type NearbyPoi = {
  schools: NearbySchool[];
  stations: NearbyStation[];
};

const SCHOOL_RADIUS_M = 1200;
const STATION_RADIUS_M = 1500;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/**
 * 단지 좌표 기준 도보권 POI. 데이터 미적재(테이블 비어 있음)면 둘 다 빈 배열 —
 * 호출부는 섹션을 그리지 않는다. 조회 실패는 throw (없음과 구분).
 */
export async function getNearbyPoi(lat: number, lng: number): Promise<NearbyPoi> {
  const sb = getServiceSupabase();
  if (!sb) return { schools: [], stations: [] };

  // bbox 필터 — 1도 위도 ≈ 111km, 경도는 위도 보정
  const latPad = SCHOOL_RADIUS_M / 111_000 + 0.003;
  const lngPad = latPad / Math.max(0.2, Math.cos((lat * Math.PI) / 180));

  const [schoolsR, stationsR] = await Promise.all([
    sb
      .from("poi_schools")
      .select("name, category, lat, lng")
      .gte("lat", lat - latPad)
      .lte("lat", lat + latPad)
      .gte("lng", lng - lngPad)
      .lte("lng", lng + lngPad)
      .limit(300),
    sb
      .from("poi_stations")
      .select("name, line, lat, lng")
      .gte("lat", lat - latPad)
      .lte("lat", lat + latPad)
      .gte("lng", lng - lngPad)
      .lte("lng", lng + lngPad)
      .limit(120),
  ]);
  if (schoolsR.error) throw new Error(`poi_schools 조회 실패: ${schoolsR.error.message}`);
  if (stationsR.error) throw new Error(`poi_stations 조회 실패: ${stationsR.error.message}`);

  const schools = (schoolsR.data ?? [])
    .map((r) => ({
      name: String(r.name),
      category: r.category ? String(r.category) : null,
      distanceM: haversineM(lat, lng, Number(r.lat), Number(r.lng)),
    }))
    .filter((s) => s.distanceM <= SCHOOL_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 6);

  const stations = (stationsR.data ?? [])
    .map((r) => ({
      name: String(r.name),
      line: r.line ? String(r.line) : null,
      distanceM: haversineM(lat, lng, Number(r.lat), Number(r.lng)),
    }))
    .filter((s) => s.distanceM <= STATION_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 4);

  return { schools, stations };
}

/* ── 인제스트 ────────────────────────────────────────────────────────── */

export type PoiIngestResult = {
  configured: boolean;
  reason?: string;
  fetched: number;
  upserted: number;
  pages: number;
};

type FieldPick = { value: string | null; num: number | null };

function pick(row: Record<string, unknown>, keys: string[]): FieldPick {
  for (const k of keys) {
    const v = row[k];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    const n = Number(s);
    return { value: s, num: Number.isFinite(n) ? n : null };
  }
  return { value: null, num: null };
}

async function fetchOdcloudAll(
  apiPath: string,
  serviceKey: string,
  maxPages = 30,
): Promise<{ rows: Array<Record<string, unknown>>; pages: number }> {
  const rows: Array<Record<string, unknown>> = [];
  let page = 1;
  for (; page <= maxPages; page += 1) {
    const url = new URL(`https://api.odcloud.kr${apiPath}`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("perPage", "1000");
    url.searchParams.set("serviceKey", serviceKey);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`odcloud ${apiPath} p${page} HTTP ${res.status}`);
    }
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const data = Array.isArray(json.data) ? json.data : [];
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return { rows, pages: page };
}

export async function ingestPoi(kind: "schools" | "stations"): Promise<PoiIngestResult> {
  const sb = getServiceSupabase();
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  const apiPath =
    kind === "schools"
      ? process.env.POI_SCHOOLS_API_PATH?.trim()
      : process.env.POI_STATIONS_API_PATH?.trim();
  if (!sb) return { configured: false, reason: "no-db", fetched: 0, upserted: 0, pages: 0 };
  if (!serviceKey) {
    return { configured: false, reason: "no-key", fetched: 0, upserted: 0, pages: 0 };
  }
  if (!apiPath || !apiPath.startsWith("/api/")) {
    // 오너 패킷 ⑧ — 표준데이터 "오픈API 상세"의 요청 주소 경로를 env 로 등록해야 켜진다
    return { configured: false, reason: "no-path", fetched: 0, upserted: 0, pages: 0 };
  }

  const { rows, pages } = await fetchOdcloudAll(apiPath, serviceKey);
  let upserted = 0;
  const batch: Array<Record<string, unknown>> = [];

  for (const r of rows) {
    const lat = pick(r, ["위도", "lat", "LAT"]).num;
    const lng = pick(r, ["경도", "lng", "LON", "LNG"]).num;
    if (lat === null || lng === null || lat < 33 || lat > 39 || lng < 124 || lng > 132) continue;

    if (kind === "schools") {
      const name = pick(r, ["학교명"]).value;
      const key = pick(r, ["학교ID", "학교아이디"]).value ?? name;
      if (!name || !key) continue;
      batch.push({
        source_key: `sch:${key}`,
        name,
        category: pick(r, ["학교급구분"]).value,
        sido: pick(r, ["시도교육청명", "소재지지번주소"]).value?.slice(0, 20) ?? null,
        address: pick(r, ["소재지도로명주소", "소재지지번주소"]).value,
        lat,
        lng,
        updated_at: new Date().toISOString(),
      });
    } else {
      const name = pick(r, ["역사명", "역명"]).value;
      const key = pick(r, ["역사ID", "역사아이디"]).value ?? `${name}:${pick(r, ["노선명"]).value ?? ""}`;
      if (!name || !key) continue;
      batch.push({
        source_key: `stn:${key}`,
        name,
        line: pick(r, ["노선명"]).value,
        operator: pick(r, ["운영기관명"]).value,
        address: pick(r, ["역사도로명주소", "소재지도로명주소"]).value,
        lat,
        lng,
        updated_at: new Date().toISOString(),
      });
    }
  }

  const table = kind === "schools" ? "poi_schools" : "poi_stations";
  for (let i = 0; i < batch.length; i += 500) {
    const chunk = batch.slice(i, i + 500);
    const { error } = await sb.from(table).upsert(chunk, { onConflict: "source_key" });
    if (error) {
      logger.error(`[poi] ${table} upsert 실패 (${i}~)`, error);
      throw new Error(`${table} upsert 실패: ${error.message}`);
    }
    upserted += chunk.length;
  }

  return { configured: true, fetched: rows.length, upserted, pages };
}
