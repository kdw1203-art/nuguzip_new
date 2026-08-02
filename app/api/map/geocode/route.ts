import { logger } from "@/lib/log";
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
    /* 업스트림(네이버) 원문 에러는 서버 로그로만 — 익명 응답에는 일반 문구.
       (원문에는 요청 URL·쿼터 정보가 실릴 수 있다) */
    logger.warn("[api/map/geocode] 지오코딩 실패", e);
    return NextResponse.json(
      { error: "지오코딩이 잠시 실패했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}
