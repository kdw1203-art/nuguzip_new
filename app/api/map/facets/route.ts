/**
 * GET /api/map/facets?minLat=&maxLat=&minLng=&maxLng=&buckets=24
 *
 * 지도 상세 필터의 막대그래프 원천 — **지금 보이는 영역**의 가격·면적·준공연도·
 * 세대수 분포.
 *
 * 왜 필요한가: 예전 필터는 "5억 이하 / 5~10억" 같은 고정 칩이었다. 그 구간에
 * 단지가 몇 개인지 모른 채 눌러야 했고, 눌러 보고 0건이면 되돌리는 식이었다.
 * 분포를 먼저 보여 주면 사용자가 "어디를 자를지"를 근거를 보고 정한다.
 *
 * 필터를 **걸기 전** 분포를 준다(필터 후 분포를 주면 손잡이를 좁힐수록 막대가
 * 사라져 되돌릴 기준을 잃는다).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120",
} as const;

/** 한 축의 분포 */
export interface FacetAxis {
  /** 축 최솟값(1퍼센타일) — 값이 있는 단지가 없으면 null */
  lo: number | null;
  /** 축 최댓값(99퍼센타일) */
  hi: number | null;
  /** 이 축의 값을 가진 단지 수 */
  n: number;
  /** 구간별 개수 (조밀 배열 — 0 도 자리를 차지한다) */
  bins: number[];
}

export interface MapFacets {
  /** 화면 안 단지 총 수 */
  total: number;
  buckets: number;
  price: FacetAxis;
  area: FacetAxis;
  year: FacetAxis;
  households: FacetAxis;
}

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
  const hasBounds =
    minLat !== null && maxLat !== null && minLng !== null && maxLng !== null &&
    minLat < maxLat && minLng < maxLng;

  const sb = getReadOnlySupabase();
  if (!sb) {
    return NextResponse.json({ error: "데이터베이스에 연결할 수 없습니다." }, { status: 503 });
  }

  const { data, error } = await sb.rpc("map_filter_facets", {
    p_min_lat: hasBounds ? minLat : null,
    p_max_lat: hasBounds ? maxLat : null,
    p_min_lng: hasBounds ? minLng : null,
    p_max_lng: hasBounds ? maxLng : null,
    p_buckets: Math.min(60, Math.max(4, num("buckets") ?? 24)),
  });

  /* 실패를 빈 분포로 흘리지 않는다. 막대가 0으로 그려지면 사용자는 "이 지역엔
     단지가 없다"로 읽는데, 우리는 그걸 확인한 적이 없다. */
  if (error) {
    logger.warn("[map/facets] map_filter_facets 실패", { message: error.message });
    return NextResponse.json({ error: "분포를 불러오지 못했습니다." }, { status: 503 });
  }

  return NextResponse.json((data ?? {}) as MapFacets, { headers: CACHE_HEADERS });
}
