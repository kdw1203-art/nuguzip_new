import { NextResponse } from "next/server";
import { searchComplexes } from "@/lib/complex/complex-store";
import { isPlaceSearchConfigured, searchPlaces } from "@/lib/search/place-search";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
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
  /* ── 미리보기 값 (2026-07-27 추가) ─────────────────────────────────────
     예전 자동완성은 이름과 지역만 줬다. 이름이 비슷한 단지가 여럿일 때
     (같은 브랜드가 전국에 깔려 있다) 어느 것인지 고를 근거가 없어, 일단
     눌러서 상세를 열어 보고 아니면 뒤로 가는 식이었다.
     고르기 전에 판단할 수 있도록 실거래 요약을 함께 싣는다.
     모르는 값은 null 로 둔다 — 0 으로 채우면 "거래 0건"이라는 거짓이 된다. */
  /** 평균 매매 실거래가(만원) */
  avgPriceManwon?: number | null;
  /** 최근 6개월 매매 건수 */
  recentTradeCount?: number | null;
  buildYear?: number | null;
  households?: number | null;
  /** 좌표를 이미 알면 실어 보낸다 — 클릭 시 지오코딩 왕복을 건너뛴다 */
  lat?: number | null;
  lng?: number | null;
}

/** 외부(지도) 장소검색 폴백 항목 — 클릭 시 지도 이동에 필요한 좌표 포함. */
export interface PlaceItem {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const PLACES_CAP = 6;

type PreviewRow = {
  complex_id: string;
  region_name: string;
  complex_name: string;
  address: string | null;
  trade_count: number | null;
  recent_trade_count: number | null;
  avg_price_manwon: number | null;
  avg_area_m2: number | null;
  build_year: number | null;
  households: number | null;
  lat: number | null;
  lng: number | null;
};

/**
 * search_complexes_preview RPC 호출 → SuggestItem[].
 *
 * RPC 가 없거나(구 DB) 실패하면 빈 배열을 돌려주고, 부르는 쪽이 기존
 * searchComplexes 경로로 물러선다. 여기서 throw 하면 폴백까지 막힌다.
 */
async function suggestViaRpc(q: string): Promise<SuggestItem[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("search_complexes_preview", { p_q: q, p_limit: 8 });
  if (error) {
    logger.warn("[search/suggest] search_complexes_preview 실패 — 기존 경로로 폴백", {
      message: error.message,
    });
    return [];
  }
  return ((data as PreviewRow[] | null) ?? []).map((r) => {
    const [city, ...rest] = (r.region_name ?? "").split(" ");
    const district = rest.join(" ");
    return {
      id: r.complex_id,
      name: r.complex_name,
      region: (r.region_name ?? "").trim(),
      dong: district || city || "",
      address: r.address || `${r.region_name} ${r.complex_name}`.trim(),
      avgPriceManwon: r.avg_price_manwon == null ? null : Number(r.avg_price_manwon),
      recentTradeCount: r.recent_trade_count == null ? null : Number(r.recent_trade_count),
      buildYear: r.build_year == null ? null : Number(r.build_year),
      households: r.households == null ? null : Number(r.households),
      lat: r.lat == null ? null : Number(r.lat),
      lng: r.lng == null ? null : Number(r.lng),
    };
  });
}

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
    /* search_complexes_preview RPC 를 먼저 쓴다.
       - 오타 내성: 예전 ilike '%q%' 는 "레미안"으로 "래미안"을 못 찾았다.
         트라이그램 유사도를 함께 봐서 표기 흔들림을 흡수한다.
       - 정렬 근거: 앞글자 일치 > 이름 유사도 > 최근 거래 활발도.
         예전엔 정렬이 없어 거래 1건짜리 단지가 위에 오기도 했다.
       - 미리보기 값(가격·거래·준공·세대수·좌표)을 함께 준다.
       RPC 가 없는 환경(구 DB)에서는 기존 경로로 물러선다. */
    suggestions = await suggestViaRpc(q);
    if (suggestions.length === 0) {
      const rows = await searchComplexes(q, undefined, 8);
      suggestions = rows.slice(0, 8).map((c) => ({
        id: c.id,
        name: c.name,
        region: `${c.city} ${c.district}`.trim(),
        dong: c.district || c.city || "",
        address: c.road_address || c.address || `${c.city} ${c.district} ${c.name}`.trim(),
      }));
    }
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
