import { NextResponse } from "next/server";
import { searchComplexes } from "@/lib/complex/complex-store";
import { isPlaceSearchConfigured, searchPlaces } from "@/lib/search/place-search";
import { logger } from "@/lib/log";

/* 검색 자동완성(#48) — 단지명 프리픽스 서제스트.
   실거래(market_transactions) 기반 searchComplexes 상위 8건 {id,name,region,dong} 반환.
   내부 결과가 부족(<3)하고 외부 장소검색 키가 설정돼 있으면 Kakao/Naver
   키워드 장소검색을 폴백으로 붙여 places[] 로 함께 반환한다(env-gated no-op).
   CDN 캐시 s-maxage=3600 (인기 프리픽스 재활용). */

export const runtime = "nodejs";

export interface SuggestItem {
  id: string;
  name: string;
  region: string;
  dong: string;
  /** 선택 시 지도 이동용 지오코딩 대상 주소(도로명 우선). 좌표는 클라이언트가 on-demand 지오코딩. */
  address: string;
}

/** 외부(지도) 장소검색 폴백 항목 — 클릭 시 지도 이동에 필요한 좌표 포함. */
export interface PlaceItem {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const PLACES_CAP = 6;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json(
      { suggestions: [] as SuggestItem[], places: [] as PlaceItem[], query: q },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  }

  let suggestions: SuggestItem[] = [];
  /* 자동완성이 빈 채로 내려가는 것 자체는 견딜 만하지만, 그 응답이
     s-maxage=3600 으로 CDN 에 얹히면 한 번의 조회 실패가 그 프리픽스의
     "검색 결과 없음"을 한 시간 동안 굳혀버린다. 실패한 응답은 캐시하지 않는다. */
  let lookupFailed = false;
  try {
    const rows = await searchComplexes(q, undefined, 8);
    suggestions = rows.slice(0, 8).map((c) => ({
      id: c.id,
      name: c.name,
      region: `${c.city} ${c.district}`.trim(),
      dong: c.district || c.city || "",
      address: c.road_address || c.address || `${c.city} ${c.district} ${c.name}`.trim(),
    }));
  } catch (e) {
    // env 미설정·조회 실패 시 빈 목록 (클라이언트는 드롭다운 미표시)
    lookupFailed = true;
    suggestions = [];
    logger.warn(`[search/suggest] 단지 자동완성 조회 실패 (q=${q})`, e);
  }

  // 내부 결과가 얇을 때(<3)만 외부 장소검색 폴백. 키 미설정 시 no-op.
  let places: PlaceItem[] = [];
  if (suggestions.length < 3 && isPlaceSearchConfigured()) {
    try {
      const seen = new Set(suggestions.map((s) => s.name.trim()));
      const results = await searchPlaces(q, PLACES_CAP);
      for (const p of results) {
        const name = p.name.trim();
        if (!name || seen.has(name)) continue; // 내부 단지명과 중복 제거
        seen.add(name);
        places.push({ name, address: p.address, lat: p.lat, lng: p.lng });
        if (places.length >= PLACES_CAP) break;
      }
    } catch {
      // searchPlaces 는 throw 하지 않지만 방어적으로 fail-soft.
      places = [];
    }
  }

  return NextResponse.json(
    { suggestions, places, query: q, failed: lookupFailed },
    {
      headers: {
        "Cache-Control": lookupFailed
          ? "no-store"
          : "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
