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
 * - zoom >= 14 (포인트 모드): 개별 단지 id/name/lat/lng 최대 300건.
 *
 * ── C1 시세 색상 오버레이 ──────────────────────────────────────
 * 두 모드 모두 국토교통부 실거래(매매) 기반 **평단가(만원/평)** 를 함께 싣는다.
 * 색을 칠하는 근거가 되는 값이라, 어디서 왔는지가 중요하다.
 *
 *  - 소스는 뷰 `map_price_point_source` 하나뿐이다. complex_geocode(좌표)와
 *    market_transactions(실거래)를 단지 단위로 이미 이어 붙여 둔 뷰다. PostgREST 로는
 *    두 테이블을 조인할 수 없어서 뷰가 필요했다.
 *  - 매매(transaction_type='trade')만 센다. 전월세의 평단가는 보증금 기준이라
 *    시세로 읽으면 거짓이 된다.
 *  - 예전 1순위였던 market_complex_price 는 **0행**이라 이 라벨이 한 번도 뜬 적이 없었다.
 *    실거래로 갈아끼우면서 그 죽은 경로를 걷어냈다.
 *  - 거래가 없는 셀·단지에는 값을 실어 보내지 않는다(필드 자체가 없다). 클라이언트가
 *    회색 + "데이터 없음"으로 그린다 — 없는 시세를 그럴듯한 색으로 채우지 않는다.
 *
 * 응답: { mode, clusters: [{lat,lng,count,pyeongManwon?,txCount?}], points: [...],
 *         priceMeta: { latestYm, txCount, complexCount } }
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { encodeComplexId } from "@/lib/complex/complex-store";
import { krwPerPyeongToManwon } from "@/lib/map/price-tiers";

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
  /** 셀 내 실거래 평단가(만원/평) — 매매 실거래가 있을 때만 존재 */
  pyeongManwon?: number;
  /** 그 평단가를 만든 실거래 건수 — 근거 표기용 */
  txCount?: number;
}

export interface MapPointItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** 단지 실거래 평단가(만원/평) — 매매 실거래가 있을 때만 존재 */
  pyeongManwon?: number;
  /** 그 평단가를 만든 실거래 건수 */
  txCount?: number;
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

/** 단지 키 — 포인트 모드에서 좌표행과 시세행을 잇는다 */
function complexKey(region: string, complex: string): string {
  return `${region}${complex}`;
}

/** 실거래 평단가 합산 — 건수 가중이라 셀 전체의 거래 단위 평균과 정확히 같아진다 */
interface PriceBucket {
  /** Σ(단지 평단가 × 단지 거래건수) = 셀 안 모든 거래의 평단가 합(원/평) */
  weightedSumKrw: number;
  /** Σ 거래건수 */
  txCount: number;
}

type ReadOnlySb = NonNullable<ReturnType<typeof getReadOnlySupabase>>;

/** map_price_point_source 한 행 — 뷰 컬럼 중 지도에 필요한 것만 */
interface PriceSourceRow {
  region_name: unknown;
  complex_name: unknown;
  lat: unknown;
  lng: unknown;
  tx_count: unknown;
  avg_per_pyeong_krw: unknown;
  latest_ym: unknown;
}

/**
 * 화면에 실린 색이 "언제 신고된 거래로 만든 색인지"를 범례가 그대로 말하게 하려고
 * 같이 내려보낸다. 기간을 코드에 박아 두면 데이터가 앞서가는 순간 거짓말이 된다.
 */
export interface MapPriceMeta {
  /** 뷰포트 안에서 가장 최근 계약월(YYYYMM). 거래가 하나도 없으면 null */
  latestYm: number | null;
  /** 뷰포트 안 색을 만든 실거래 총 건수 */
  txCount: number;
  /** 색이 칠해진 단지 수 */
  complexCount: number;
}

/** 시세를 한 건도 못 찾았을 때 — 범례가 "데이터 없음"으로 떨어진다 */
const EMPTY_PRICE_META: MapPriceMeta = { latestYm: null, txCount: 0, complexCount: 0 };

/** 뷰포트 시세 출처 요약 — 범례 문구의 근거 */
function summarizePriceMeta(rows: PriceSourceRow[]): MapPriceMeta {
  let latestYm: number | null = null;
  let txCount = 0;
  let complexCount = 0;
  for (const r of rows) {
    const n = Number(r.tx_count);
    if (!Number.isFinite(n) || n <= 0) continue;
    txCount += n;
    complexCount += 1;
    const ym = Number(r.latest_ym);
    if (Number.isFinite(ym) && ym > 0 && (latestYm == null || ym > latestYm)) latestYm = ym;
  }
  return { latestYm, txCount, complexCount };
}

/**
 * 뷰포트 안 단지별 실거래 평단가 조회.
 * 실패하면 빈 배열 — 지도는 개수 마커만으로 계속 동작한다(graceful fallback).
 */
async function fetchPriceSource(
  sb: ReadOnlySb,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): Promise<PriceSourceRow[]> {
  try {
    const { data, error } = await sb
      .from("map_price_point_source")
      .select("region_name,complex_name,lat,lng,tx_count,avg_per_pyeong_krw,latest_ym")
      .gte("lat", bounds.minLat)
      .lte("lat", bounds.maxLat)
      .gte("lng", bounds.minLng)
      .lte("lng", bounds.maxLng)
      // 거래가 많은 단지부터 — 하드캡에 걸려 잘리더라도 근거가 두꺼운 쪽이 남는다
      .order("tx_count", { ascending: false, nullsFirst: false })
      .limit(MAX_PRICE_SOURCE_ROWS);
    if (error) return [];
    return (data ?? []) as unknown as PriceSourceRow[];
  } catch {
    // 뷰 미구축 등 — 시세 없이 개수만
    return [];
  }
}

/**
 * 셀별 실거래 평단가 집계.
 *
 * 단지 평단가에 그 단지의 거래건수를 곱해 더한 뒤 총 건수로 나눈다. 뷰의
 * avg_per_pyeong_krw 가 그 단지 거래들의 산술평균이므로, 곱하면 거래별 값의 합이
 * 그대로 복원된다 — 결과는 "셀 안 모든 거래의 평단가 평균"과 일치한다. 단지별
 * 단순평균을 쓰면 거래 2건짜리 단지가 200건짜리 단지와 같은 무게를 갖게 되어
 * 실제 시세와 어긋난다.
 * (뷰에서 원 단위로 반올림된 값이라 거래당 최대 0.5원 오차가 생기지만, 표시 단위가
 *  만원이라 화면에 드러나지 않는다.)
 */
function aggregateCellPrices(
  rows: PriceSourceRow[],
  cell: number,
): Map<string, PriceBucket> {
  const buckets = new Map<string, PriceBucket>();
  for (const r of rows) {
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    const perPyeong = Number(r.avg_per_pyeong_krw);
    const txCount = Number(r.tx_count);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!Number.isFinite(perPyeong) || perPyeong <= 0) continue;
    if (!Number.isFinite(txCount) || txCount <= 0) continue;

    const key = cellKey(lat, lng, cell);
    const b = buckets.get(key);
    if (b) {
      b.weightedSumKrw += perPyeong * txCount;
      b.txCount += txCount;
    } else {
      buckets.set(key, { weightedSumKrw: perPyeong * txCount, txCount });
    }
  }
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
      { mode, clusters: [], points: [], priceMeta: EMPTY_PRICE_META },
      { headers: CACHE_HEADERS },
    );
  }

  const bounds = { minLat, maxLat, minLng, maxLng };

  try {
    if (mode === "points") {
      // 개별 단지 포인트 — 지오코딩 캐시(complex_geocode)에서 뷰포트 내 좌표. 거래량 상위.
      // 시세는 별도 뷰에서 받아 단지 키로 잇는다(PostgREST 조인 불가).
      const [geoRes, priceRows] = await Promise.all([
        sb
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
          .limit(MAX_POINTS),
        fetchPriceSource(sb, bounds),
      ]);
      if (geoRes.error) throw geoRes.error;

      const priceByComplex = new Map<string, { manwon: number; txCount: number }>();
      for (const r of priceRows) {
        const manwon = krwPerPyeongToManwon(Number(r.avg_per_pyeong_krw));
        const txCount = Number(r.tx_count);
        if (manwon == null || !Number.isFinite(txCount) || txCount <= 0) continue;
        priceByComplex.set(
          complexKey(String(r.region_name ?? ""), String(r.complex_name ?? "")),
          { manwon, txCount },
        );
      }

      const points: MapPointItem[] = ((geoRes.data ?? []) as Array<Record<string, unknown>>)
        .filter(
          (r) =>
            r.region_name &&
            r.complex_name &&
            Number.isFinite(Number(r.lat)) &&
            Number.isFinite(Number(r.lng)),
        )
        .map((r) => {
          const region = String(r.region_name);
          const name = String(r.complex_name);
          const point: MapPointItem = {
            id: encodeComplexId(region, name),
            name,
            lat: Number(r.lat),
            lng: Number(r.lng),
          };
          // 거래가 없으면 필드를 아예 붙이지 않는다 — 클라이언트가 "데이터 없음"으로 그린다
          const price = priceByComplex.get(complexKey(region, name));
          if (price) {
            point.pyeongManwon = price.manwon;
            point.txCount = price.txCount;
          }
          return point;
        });

      return NextResponse.json(
        { mode, clusters: [], points, priceMeta: summarizePriceMeta(priceRows) },
        { headers: CACHE_HEADERS },
      );
    }

    // 클러스터 모드 — 좌표만 가져와 그리드 집계 (complex_geocode) + 셀별 실거래 평단가
    const [geoRes, priceRows] = await Promise.all([
      sb
        .from("complex_geocode")
        .select("lat,lng")
        .eq("status", "ok")
        .not("lat", "is", null)
        .not("lng", "is", null)
        .gte("lat", minLat)
        .lte("lat", maxLat)
        .gte("lng", minLng)
        .lte("lng", maxLng)
        .limit(MAX_CLUSTER_SOURCE_ROWS),
      fetchPriceSource(sb, bounds),
    ]);
    if (geoRes.error) throw geoRes.error;

    const cell = cellSizeForZoom(zoom);
    const buckets = new Map<string, { sumLat: number; sumLng: number; count: number }>();
    for (const row of (geoRes.data ?? []) as Array<Record<string, unknown>>) {
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

    const priceBuckets = aggregateCellPrices(priceRows, cell);

    const clusters: MapClusterItem[] = Array.from(buckets.entries(), ([key, b]) => {
      const item: MapClusterItem = {
        lat: Math.round((b.sumLat / b.count) * 1e6) / 1e6,
        lng: Math.round((b.sumLng / b.count) * 1e6) / 1e6,
        count: b.count,
      };
      const p = priceBuckets.get(key);
      if (p && p.txCount > 0) {
        const manwon = krwPerPyeongToManwon(p.weightedSumKrw / p.txCount);
        if (manwon != null) {
          item.pyeongManwon = manwon;
          item.txCount = p.txCount;
        }
      }
      return item;
    });

    return NextResponse.json(
      { mode, clusters, points: [], priceMeta: summarizePriceMeta(priceRows) },
      { headers: CACHE_HEADERS },
    );
  } catch {
    // 테이블 미구축·조회 실패 시에도 지도는 기존 마커로 계속 동작
    return NextResponse.json(
      { mode, clusters: [], points: [], priceMeta: EMPTY_PRICE_META },
      { headers: CACHE_HEADERS },
    );
  }
}
