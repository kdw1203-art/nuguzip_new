import { NextResponse } from "next/server";
import {
  isNaverMapsRestConfigured,
  naverGeocode,
  naverReverseGeocode,
} from "@/lib/map/naver-maps-rest";

/**
 * NCP Maps Geocoding / Reverse Geocoding 프록시 (서버 전용 Client Secret).
 * @see https://api.ncloud-docs.com/docs/application-maps-overview
 *
 * GET ?q=강남구          — 주소 검색
 * GET ?lat=37.5&lng=127  — 역지오코딩
 */
export async function GET(req: Request) {
  if (!isNaverMapsRestConfigured()) {
    return NextResponse.json(
      {
        error: "NAVER Maps REST API 미설정",
        hint: "NEXT_PUBLIC_NAVER_MAP_CLIENT_ID + NAVER_MAP_CLIENT_SECRET 필요. NCP 콘솔에서 Geocoding API 활성화.",
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  const limit = Math.min(10, Math.max(1, Number(searchParams.get("limit") ?? 5)));

  try {
    if (latRaw && lngRaw) {
      const lat = Number.parseFloat(latRaw);
      const lng = Number.parseFloat(lngRaw);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json({ error: "유효한 lat/lng 가 필요합니다." }, { status: 400 });
      }
      const item = await naverReverseGeocode(lat, lng);
      return NextResponse.json({
        source: "naver-maps-rest",
        items: item ? [item] : [],
      });
    }

    if (!q) {
      return NextResponse.json(
        { error: "q(주소) 또는 lat+lng(좌표) 쿼리가 필요합니다." },
        { status: 400 },
      );
    }

    const items = await naverGeocode(q, limit);
    return NextResponse.json({ source: "naver-maps-rest", items });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Geocoding failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
