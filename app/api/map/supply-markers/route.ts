import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getCachedCoordMap, coordKey } from "@/lib/map/complex-geocode";
import { dbUnavailable } from "@/lib/api/db-unavailable";

/* ============================================================
   [#74] 입주물량 지도 레이어 — GET /api/map/supply-markers
   apartment_supply(자동 수집) 중 이번 달 이후 입주 예정 단지를,
   complex_geocode 캐시에 좌표가 있는 것만 마커로 돌려준다.

   좌표 없는 단지를 지어내지 않는다 — 응답에 uncoordinated(좌표 미확보 수)를
   실어 지도 토글 라벨이 "표시 N곳 · 좌표 준비 중 M곳"으로 사실을 말하게 한다.
   좌표 채우기는 수집 크론의 지오코딩 훅(supply-ingest)이 하루 상한 안에서
   점진적으로 한다 — 이 GET 은 절대 지오코딩을 하지 않는다(응답 시간·비용).
   ============================================================ */

export const runtime = "nodejs";
export const revalidate = 3600;

type SupplyMarker = {
  lat: number;
  lng: number;
  name: string;
  region: string;
  moveInYm: string;
  households: number | null;
};

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  const sb = getServiceSupabase();
  if (!sb) return dbUnavailable("map/supply-markers", new Error("service client 미구성"));

  const { data, error } = await sb
    .from("apartment_supply")
    .select("move_in_ym, region, apt_name, households")
    .gte("move_in_ym", currentYm())
    .not("apt_name", "is", null)
    .order("move_in_ym", { ascending: true })
    .limit(1500);
  if (error) {
    return NextResponse.json(
      { error: "입주 물량 조회에 실패했어요." },
      { status: 503 },
    );
  }

  const rows = (data ?? [])
    .map((r) => ({
      moveInYm: String(r.move_in_ym ?? ""),
      region: String(r.region ?? "").trim(),
      name: String(r.apt_name ?? "").trim(),
      households: r.households === null ? null : Number(r.households),
    }))
    .filter((r) => r.name && r.region);

  let coords: Map<string, { lat: number; lng: number }>;
  try {
    coords = await getCachedCoordMap(rows.map((r) => ({ region: r.region, name: r.name })));
  } catch {
    return NextResponse.json(
      { error: "좌표 캐시 조회에 실패했어요." },
      { status: 503 },
    );
  }

  const items: SupplyMarker[] = [];
  let uncoordinated = 0;
  for (const r of rows) {
    const c = coords.get(coordKey(r.region, r.name));
    if (c) {
      items.push({
        lat: c.lat,
        lng: c.lng,
        name: r.name,
        region: r.region,
        moveInYm: r.moveInYm,
        households: r.households,
      });
    } else {
      uncoordinated += 1;
    }
  }

  return NextResponse.json(
    { items, uncoordinated, total: rows.length },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600" } },
  );
}
