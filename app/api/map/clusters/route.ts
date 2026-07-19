/**
 * GET /api/map/clusters?minLat=&maxLat=&minLng=&maxLng=&zoom=
 *
 * 지도 서버 클러스터링 — 뷰포트 안 단지(complexes)를 줌 레벨에 따라
 * 그리드 셀로 묶어 반환한다.
 *
 * - zoom < 14 (클러스터 모드): 뷰포트 내 좌표(lat,lng)만 최대 5,000건 조회 후
 *   라우트에서 floor(lat/cell) 그리드로 집계 (PostgREST는 GROUP BY 집계를
 *   지원하지 않아 RPC 없이 JS 집계 — 최소 컬럼·하드캡으로 비용 제한).
 * - zoom >= 14 (포인트 모드): 개별 단지 id/name/lat/lng 최대 300건.
 *   (대표 시세는 단지별 별도 테이블 조회가 필요해 여기서는 생략 —
 *   클라이언트가 이미 보유한 시세 마커와 병합해 사용)
 *
 * 응답: { mode: "clusters" | "points", clusters: [{lat,lng,count}], points: [...] }
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";

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
      const { data, error } = await sb
        .from("complexes")
        .select("id,name,lat,lng")
        .not("lat", "is", null)
        .not("lng", "is", null)
        .gte("lat", minLat)
        .lte("lat", maxLat)
        .gte("lng", minLng)
        .lte("lng", maxLng)
        .limit(MAX_POINTS);
      if (error) throw error;

      const points: MapPointItem[] = ((data ?? []) as Array<Record<string, unknown>>)
        .filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng)))
        .map((r) => ({
          id: String(r.id),
          name: String(r.name ?? ""),
          lat: Number(r.lat),
          lng: Number(r.lng),
        }));

      return NextResponse.json({ mode, clusters: [], points }, { headers: CACHE_HEADERS });
    }

    // 클러스터 모드 — 좌표만 가져와 그리드 집계
    const { data, error } = await sb
      .from("complexes")
      .select("lat,lng")
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
      const key = `${Math.floor(lat / cell)}:${Math.floor(lng / cell)}`;
      const b = buckets.get(key);
      if (b) {
        b.sumLat += lat;
        b.sumLng += lng;
        b.count += 1;
      } else {
        buckets.set(key, { sumLat: lat, sumLng: lng, count: 1 });
      }
    }

    const clusters: MapClusterItem[] = Array.from(buckets.values(), (b) => ({
      lat: Math.round((b.sumLat / b.count) * 1e6) / 1e6,
      lng: Math.round((b.sumLng / b.count) * 1e6) / 1e6,
      count: b.count,
    }));

    return NextResponse.json({ mode, clusters, points: [] }, { headers: CACHE_HEADERS });
  } catch {
    // 테이블 미구축·조회 실패 시에도 지도는 기존 마커로 계속 동작
    return NextResponse.json(
      { mode, clusters: [], points: [] },
      { headers: CACHE_HEADERS },
    );
  }
}
