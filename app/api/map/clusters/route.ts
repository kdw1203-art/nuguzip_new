/**
 * GET /api/map/clusters?minLat=&maxLat=&minLng=&maxLng=&zoom=
 *
 * 지도 서버 클러스터링 — 뷰포트 안 지오코딩 단지(complex_geocode)를 줌 레벨에 따라
 * 그리드 셀로 묶어 반환한다. 개별 포인트 id 는 encodeComplexId(region,name) — 상세 패널이
 * /api/complex/[id]/detail 로 그대로 해석한다.
 *
 * - zoom < 14 (클러스터 모드): 뷰포트 내 좌표(lat,lng)만 최대 5,000건 조회 후
 *   라우트에서 floor(lat/cell) 그리드로 집계 (PostgREST는 GROUP BY 집계를
 *   지원하지 않아 RPC 없이 JS 집계 — 최소 컬럼·하드캡으로 비용 제한).
 *   호갱노노식 가격 라벨: 같은 그리드 셀의 평균 매매가(만원)를 best-effort로
 *   함께 집계해 avgManwon으로 반환 (1순위 market_complex_price 좌표 조회,
 *   0건이면 2순위 complex_transactions + complexes 임베드 조인 — 실패 시 개수만).
 * - zoom >= 14 (포인트 모드): 개별 단지 id/name/lat/lng 최대 300건.
 *   (대표 시세는 단지별 별도 테이블 조회가 필요해 여기서는 생략 —
 *   클라이언트가 이미 보유한 시세 마커와 병합해 사용)
 *
 * 응답: { mode: "clusters" | "points", clusters: [{lat,lng,count,avgManwon?}], points: [...] }
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { encodeComplexId } from "@/lib/complex/complex-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 클러스터 집계용 좌표 조회 하드캡 */
const MAX_CLUSTER_SOURCE_ROWS = 5000;
/** 포인트 모드 최대 반환 개수 */
const MAX_POINTS = 300;
/** 이 네이버 줌 이상이면 개별 단지 포인트 반환 */
const POINT_MODE_MIN_ZOOM = 14;

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120",
} as const;

export interface MapClusterItem {
  lat: number;
  lng: number;
  count: number;
  /** 셀 내 평균 매매가(만원) — 시세 데이터가 있을 때만 존재 */
  avgManwon?: number;
}

export interface MapPointItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 네이버 줌 → 그리드 셀 크기(도 단위). 낮은 줌일수록 굵게 묶는다. */
function cellSizeForZoom(zoom: number): number {
  if (zoom <= 8) return 0.5; // 광역시·도
  if (zoom <= 10) return 0.2; // 시·군·구
  if (zoom <= 11) return 0.1;
  if (zoom <= 12) return 0.05; // 동
  return 0.025; // 13
}

/** 그리드 셀 키 — 클러스터·가격 집계가 동일한 키를 쓰도록 공용화 */
function cellKey(lat: number, lng: number, cell: number): string {
  return `${Math.floor(lat / cell)}:${Math.floor(lng / cell)}`;
}

/** 가격 집계 소스 조회 하드캡 */
const MAX_PRICE_SOURCE_ROWS = 4000;

interface PriceBucket {
  sum: number;
  count: number;
}

type ReadOnlySb = NonNullable<ReturnType<typeof getReadOnlySupabase>>;

/**
 * 셀별 평균 매매가(만원) 집계 — best-effort.
 * 1순위: market_complex_price (좌표 보유 · 크롤/KB 시세)
 * 2순위: complex_transactions(전체 평균 행) + complexes 임베드 조인(실거래 캐시)
 * 어떤 소스도 실패/0건이면 빈 Map → 클러스터는 개수만 표시 (graceful fallback).
 */
async function aggregateCellPrices(
  sb: ReadOnlySb,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  cell: number,
): Promise<Map<string, PriceBucket>> {
  const buckets = new Map<string, PriceBucket>();
  const add = (lat: number, lng: number, manwon: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (!Number.isFinite(manwon) || manwon <= 0) return;
    const key = cellKey(lat, lng, cell);
    const b = buckets.get(key);
    if (b) {
      b.sum += manwon;
      b.count += 1;
    } else {
      buckets.set(key, { sum: manwon, count: 1 });
    }
  };

  // 1순위 — market_complex_price (lat/lng 직접 보유)
  try {
    const { data, error } = await sb
      .from("market_complex_price")
      .select("lat,lng,sale_general")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .not("sale_general", "is", null)
      .gte("lat", bounds.minLat)
      .lte("lat", bounds.maxLat)
      .gte("lng", bounds.minLng)
      .lte("lng", bounds.maxLng)
      .limit(MAX_PRICE_SOURCE_ROWS);
    if (!error) {
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        add(Number(r.lat), Number(r.lng), Number(r.sale_general));
      }
    }
  } catch {
    // 테이블 미구축 등 — 다음 소스로
  }
  // market_complex_price 좌표 시세만 사용(2순위 complex_transactions/complexes 는 미존재 테이블이라 제거).
  return buckets;
}

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  const rawMinLat = Number(url.searchParams.get("minLat"));
  const rawMaxLat = Number(url.searchParams.get("maxLat"));
  const rawMinLng = Number(url.searchParams.get("minLng"));
  const rawMaxLng = Number(url.searchParams.get("maxLng"));
  const rawZoom = Number(url.searchParams.get("zoom"));

  if (
    ![rawMinLat, rawMaxLat, rawMinLng, rawMaxLng, rawZoom].every((n) => Number.isFinite(n))
  ) {
    return NextResponse.json(
      { error: "minLat,maxLat,minLng,maxLng,zoom are required numbers" },
      { status: 400 },
    );
  }

  // 검증·클램프 (min/max 뒤집힘도 정규화)
  const minLat = clamp(Math.min(rawMinLat, rawMaxLat), -90, 90);
  const maxLat = clamp(Math.max(rawMinLat, rawMaxLat), -90, 90);
  const minLng = clamp(Math.min(rawMinLng, rawMaxLng), -180, 180);
  const maxLng = clamp(Math.max(rawMinLng, rawMaxLng), -180, 180);
  const zoom = clamp(Math.round(rawZoom), 1, 21);

  const mode: "clusters" | "points" = zoom >= POINT_MODE_MIN_ZOOM ? "points" : "clusters";

  const sb = getReadOnlySupabase();
  if (!sb) {
    // env 미설정 등 — 지도 자체는 계속 동작하도록 빈 결과로 응답
    return NextResponse.json(
      { mode, clusters: [], points: [] },
      { headers: CACHE_HEADERS },
    );
  }

  try {
    if (mode === "points") {
      // 개별 단지 포인트 — 지오코딩 캐시(complex_geocode)에서 뷰포트 내 좌표. 거래량 상위.
      const { data, error } = await sb
        .from("complex_geocode")
        .select("region_name,complex_name,lat,lng")
        .eq("status", "ok")
        .not("lat", "is", null)
        .not("lng", "is", null)
        .gte("lat", minLat)
        .lte("lat", maxLat)
        .gte("lng", minLng)
        .lte("lng", maxLng)
        .order("trade_count", { ascending: false, nullsFirst: false })
        .limit(MAX_POINTS);
      if (error) throw error;

      const points: MapPointItem[] = ((data ?? []) as Array<Record<string, unknown>>)
        .filter(
          (r) =>
            r.region_name &&
            r.complex_name &&
            Number.isFinite(Number(r.lat)) &&
            Number.isFinite(Number(r.lng)),
        )
        .map((r) => ({
          id: encodeComplexId(String(r.region_name), String(r.complex_name)),
          name: String(r.complex_name ?? ""),
          lat: Number(r.lat),
          lng: Number(r.lng),
        }));

      return NextResponse.json({ mode, clusters: [], points }, { headers: CACHE_HEADERS });
    }

    // 클러스터 모드 — 좌표만 가져와 그리드 집계 (complex_geocode)
    const { data, error } = await sb
      .from("complex_geocode")
      .select("lat,lng")
      .eq("status", "ok")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .gte("lat", minLat)
      .lte("lat", maxLat)
      .gte("lng", minLng)
      .lte("lng", maxLng)
      .limit(MAX_CLUSTER_SOURCE_ROWS);
    if (error) throw error;

    const cell = cellSizeForZoom(zoom);
    const buckets = new Map<string, { sumLat: number; sumLng: number; count: number }>();
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const key = cellKey(lat, lng, cell);
      const b = buckets.get(key);
      if (b) {
        b.sumLat += lat;
        b.sumLng += lng;
        b.count += 1;
      } else {
        buckets.set(key, { sumLat: lat, sumLng: lng, count: 1 });
      }
    }

    // 호갱노노식 가격 라벨 — 셀별 평균 매매가(만원) best-effort 집계
    const priceBuckets = await aggregateCellPrices(
      sb,
      { minLat, maxLat, minLng, maxLng },
      cell,
    ).catch(() => new Map<string, PriceBucket>());

    const clusters: MapClusterItem[] = Array.from(buckets.entries(), ([key, b]) => {
      const item: MapClusterItem = {
        lat: Math.round((b.sumLat / b.count) * 1e6) / 1e6,
        lng: Math.round((b.sumLng / b.count) * 1e6) / 1e6,
        count: b.count,
      };
      const p = priceBuckets.get(key);
      if (p && p.count > 0) item.avgManwon = Math.round(p.sum / p.count);
      return item;
    });

    return NextResponse.json({ mode, clusters, points: [] }, { headers: CACHE_HEADERS });
  } catch {
    // 테이블 미구축·조회 실패 시에도 지도는 기존 마커로 계속 동작
    return NextResponse.json(
      { mode, clusters: [], points: [] },
      { headers: CACHE_HEADERS },
    );
  }
}
