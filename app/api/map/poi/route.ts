import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { dbUnavailable } from "@/lib/api/db-unavailable";

/* [943 · #96 지도편] 학교·도시철도역 POI 지도 레이어.
 *
 * 데이터: 공공데이터포털 표준데이터 2종(poi_schools·poi_stations — poi-ingest 크론).
 * 활용신청(오너 패킷 ⑧)이 아직이라 표가 비어 있을 수 있다 — 그때 "이 화면에
 * 학교가 없다"로 그리면 거짓이므로, 표 자체가 비었는지(ready)를 함께 내려보내
 * 클라이언트가 "데이터 준비 중"과 "이 지역에 없음"을 구분해 말하게 한다.
 *
 * 뷰포트 bbox 필수 — 전국 학교 1.2만 곳을 통째로 내리는 API 는 만들지 않는다.
 */

export const runtime = "nodejs";
export const revalidate = 21600; // 학교·역 위치는 사실상 정적

const MAX_PER_KIND = 400;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const num = (k: string) => {
    const v = Number(sp.get(k));
    return Number.isFinite(v) ? v : null;
  };
  const swLat = num("swLat");
  const swLng = num("swLng");
  const neLat = num("neLat");
  const neLng = num("neLng");
  if (swLat === null || swLng === null || neLat === null || neLng === null || swLat >= neLat || swLng >= neLng) {
    return NextResponse.json({ error: "bbox(swLat,swLng,neLat,neLng)가 필요합니다." }, { status: 400 });
  }
  /* 과대 뷰포트(전국 줌아웃)는 POI 를 그릴 줌이 아니다 — 마커 수천 개를 만들
     바에 정직하게 "확대하면 표시" 로 안내한다. */
  const tooWide = neLat - swLat > 0.45 || neLng - swLng > 0.6;

  const sb = getServiceSupabase();
  if (!sb) return dbUnavailable("map/poi", new Error("service client 미구성"));

  const [schoolCountR, stationCountR] = await Promise.all([
    sb.from("poi_schools").select("*", { count: "exact", head: true }),
    sb.from("poi_stations").select("*", { count: "exact", head: true }),
  ]);
  const schoolsReady = (schoolCountR.count ?? 0) > 0;
  const stationsReady = (stationCountR.count ?? 0) > 0;

  if (tooWide || (!schoolsReady && !stationsReady)) {
    return NextResponse.json(
      { schools: [], stations: [], schoolsReady, stationsReady, tooWide },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=21600" } },
    );
  }

  const [schoolsR, stationsR] = await Promise.all([
    schoolsReady
      ? sb
          .from("poi_schools")
          .select("name, category, lat, lng")
          .gte("lat", swLat).lte("lat", neLat)
          .gte("lng", swLng).lte("lng", neLng)
          .limit(MAX_PER_KIND)
      : Promise.resolve({ data: [], error: null }),
    stationsReady
      ? sb
          .from("poi_stations")
          .select("name, line, lat, lng")
          .gte("lat", swLat).lte("lat", neLat)
          .gte("lng", swLng).lte("lng", neLng)
          .limit(MAX_PER_KIND)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (schoolsR.error || stationsR.error) {
    return NextResponse.json({ error: "POI 조회 실패" }, { status: 503 });
  }

  return NextResponse.json(
    {
      schools: (schoolsR.data ?? []).map((r) => ({
        name: String(r.name),
        category: r.category ? String(r.category) : null,
        lat: Number(r.lat),
        lng: Number(r.lng),
      })),
      stations: (stationsR.data ?? []).map((r) => ({
        name: String(r.name),
        line: r.line ? String(r.line) : null,
        lat: Number(r.lat),
        lng: Number(r.lng),
      })),
      schoolsReady,
      stationsReady,
      tooWide: false,
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=21600" } },
  );
}
