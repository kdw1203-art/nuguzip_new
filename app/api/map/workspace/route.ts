import { NextResponse } from "next/server";
import { buildDistrictWorkspace } from "@/lib/map/district-workspace-service";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";

/**
 * GET /api/map/workspace?district=강남구&city=서울특별시&lat=37.5&lng=127.0
 * 지역 decision workspace — 3축 집계 (공공 · 주변/전문가 · 전환)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const district = url.searchParams.get("district")?.trim();
  if (!district) {
    return NextResponse.json({ error: "district 파라미터가 필요합니다." }, { status: 400 });
  }

  const city = url.searchParams.get("city")?.trim() ?? undefined;
  const latRaw = url.searchParams.get("lat");
  const lngRaw = url.searchParams.get("lng");
  const lat = latRaw ? Number(latRaw) : undefined;
  const lng = lngRaw ? Number(lngRaw) : undefined;

  /* 스냅샷 조회가 실패하면 아래가 던진다. 그대로 두면 500 에 내부 오류 메시지가
     실려 나간다. 못 읽었을 뿐이라고 503 으로 말한다. */
  let payload: Awaited<ReturnType<typeof buildDistrictWorkspace>>;
  try {
    payload = await buildDistrictWorkspace({
      city,
      district,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
    });
  } catch (e) {
    return dbUnavailable("map-workspace", e);
  }

  return NextResponse.json(payload);
}
