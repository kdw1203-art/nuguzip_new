import { NextResponse } from "next/server";
import { buildDistrictWorkspace } from "@/lib/map/district-workspace-service";

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

  const payload = await buildDistrictWorkspace({
    city,
    district,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
  });

  return NextResponse.json(payload);
}
