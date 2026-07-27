/**
 * GET /api/map/popular?minLat=&maxLat=&minLng=&maxLng=&limit=10
 *
 * 지도 좌측 패널 "인기 단지" — **지금 화면에 보이는 영역**의 상위 단지.
 *
 * 왜 만들었나: 예전 지도는 좌표가 있는 단지를 전국에서 거래량순 30개만 서버
 * 렌더로 가져온 뒤, 그중 한 지역 이름을 붙여 "수원 단지 30" 이라고 적었다.
 * 목록에는 안양·창원·수원이 뒤섞여 있었고, 지도를 아무리 움직여도 목록은
 * 그대로였다 — 지역 필터가 애초에 없었기 때문이다. 소유자도 "무슨 말인지
 * 모르겠다"고 했는데, 라벨이 잘못된 게 아니라 데이터가 화면과 무관했다.
 *
 * 순위: popular_complexes() RPC — 최근 6개월 실거래 건수 + 조회수(0.3 가중).
 * 근거는 그 함수 주석에 있다. 여기서는 뷰포트를 넘기고 받은 대로 그린다.
 *
 * 범위 인자를 안 주면 전국 기준으로 돌려준다(줌아웃 상태).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 패널에 실제로 보여 주는 개수 — 소유자 요청(10개) */
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

const CACHE_HEADERS = {
  // 뷰포트마다 달라지지만 실거래·조회수는 분 단위로 안 바뀐다.
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120",
} as const;

export interface PopularComplexItem {
  id: string;
  name: string;
  regionName: string;
  lat: number;
  lng: number;
  /** 최근 6개월 매매 실거래 건수 — 순위 근거를 화면에 그대로 보여 준다 */
  recentTradeCount: number;
  /** 누적 매매 실거래 건수 */
  tradeCount: number;
  viewCount: number;
  /** 평균 매매 실거래가(만원) — 값이 없으면 null(모르는 것을 0으로 쓰지 않는다) */
  avgPriceManwon: number | null;
  avgAreaM2: number | null;
  buildYear: number | null;
  households: number | null;
}

type Row = {
  complex_id: string;
  region_name: string;
  complex_name: string;
  lat: number;
  lng: number;
  trade_count: number;
  recent_trade_count: number;
  view_count: number;
  avg_price_manwon: number | null;
  avg_area_m2: number | null;
  build_year: number | null;
  households: number | null;
};

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  const num = (k: string): number | null => {
    const raw = url.searchParams.get(k);
    if (raw === null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const minLat = num("minLat");
  const maxLat = num("maxLat");
  const minLng = num("minLng");
  const maxLng = num("maxLng");
  /* 네 값이 모두 있어야 뷰포트로 본다. 하나라도 빠지면 전국 기준 —
     "일부만 적용된 범위"로 엉뚱한 목록을 만드는 것보다 낫다. */
  const hasBounds =
    minLat !== null && maxLat !== null && minLng !== null && maxLng !== null &&
    minLat < maxLat && minLng < maxLng;

  const limit = Math.min(MAX_LIMIT, Math.max(1, num("limit") ?? DEFAULT_LIMIT));

  const sb = getReadOnlySupabase();
  if (!sb) {
    return NextResponse.json(
      { error: "데이터베이스에 연결할 수 없습니다." },
      { status: 503 },
    );
  }

  const { data, error } = await sb.rpc("popular_complexes", {
    p_min_lat: hasBounds ? minLat : null,
    p_max_lat: hasBounds ? maxLat : null,
    p_min_lng: hasBounds ? minLng : null,
    p_max_lng: hasBounds ? maxLng : null,
    p_limit: limit,
    /* 범위 필터 — 안 보낸 축은 null 이고, null 은 "조건 없음"이다.
       값이 없는 단지를 조건 불만족으로 떨어뜨리지 않는 규칙은 RPC 안에 있다. */
    p_price_min: num("priceMin"),
    p_price_max: num("priceMax"),
    p_area_min: num("areaMin"),
    p_area_max: num("areaMax"),
    p_year_min: num("yearMin"),
    p_year_max: num("yearMax"),
    p_hh_min: num("hhMin"),
    p_hh_max: num("hhMax"),
  });

  /* 조회 실패를 빈 목록으로 흘리지 않는다. 그러면 패널이 "이 지역에 단지가
     없어요" 로 그려지는데, 우리는 없다는 걸 확인한 적이 없다 — 못 읽었을 뿐이다. */
  if (error) {
    logger.warn("[map/popular] popular_complexes 실패", { message: error.message });
    return NextResponse.json(
      { error: "인기 단지를 불러오지 못했습니다." },
      { status: 503 },
    );
  }

  const items: PopularComplexItem[] = ((data as Row[] | null) ?? []).map((r) => ({
    id: r.complex_id,
    name: r.complex_name,
    regionName: r.region_name,
    lat: Number(r.lat),
    lng: Number(r.lng),
    recentTradeCount: Number(r.recent_trade_count ?? 0),
    tradeCount: Number(r.trade_count ?? 0),
    viewCount: Number(r.view_count ?? 0),
    avgPriceManwon: r.avg_price_manwon == null ? null : Number(r.avg_price_manwon),
    avgAreaM2: r.avg_area_m2 == null ? null : Number(r.avg_area_m2),
    buildYear: r.build_year == null ? null : Number(r.build_year),
    households: r.households == null ? null : Number(r.households),
  }));

  return NextResponse.json(
    { scope: hasBounds ? "viewport" : "nationwide", items },
    { headers: CACHE_HEADERS },
  );
}
