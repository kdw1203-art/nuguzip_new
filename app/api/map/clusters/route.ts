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
import { logger } from "@/lib/log";

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
  /** 전세 평균 보증금(만원) — type=rent 요청 + 최근 전세 실거래가 있을 때만 존재 */
  jeonseManwon?: number;
  /** 그 평균을 만든 전세 실거래 건수 */
  jeonseCount?: number;
  /* ── 상세 필터용 속성 (2026-07-27 추가) ───────────────────────────────────
     막대그래프 범위 슬라이더(가격·면적·준공·세대수)는 서버에서 렌더한 단지 30개
     에만 걸렸다. 지도에 실제로 찍히는 마커는 이 points 배열인데 여기에 필터로
     쓸 값이 하나도 없어서, 필터를 켜면 마커를 통째로 숨기는 수밖에 없었다.
     complex_tx_stats(집계 MV)에서 네 축을 실어 보내 마커도 걸러지게 한다.
     값이 없으면 필드를 붙이지 않는다 — 0 으로 채우면 "0세대 단지"가 된다. */
  /** 평균 매매 실거래가(만원) */
  avgPriceManwon?: number;
  /** 평균 전용면적(㎡) */
  avgAreaM2?: number;
  buildYear?: number;
  households?: number;
}

/**
 * 뷰포트 안 단지들의 상세 필터 속성 — map_complex_attrs RPC 한 번.
 *
 * PostgREST 로 직접 읽던 초기 구현은 두 번 막혔다.
 *  · 단지명 300개를 IN 에 넣으면 한글 URL 인코딩으로 쿼리스트링이 10KB 를 넘어
 *    요청 자체가 실패했다("TypeError: fetch failed").
 *  · 지역 이름으로만 좁히면 서울 한복판에서 3만 행이 넘어와 25초 읽기 상한에 걸렸다.
 * 좌표로 잘라야 하는데 complex_tx_stats 에는 좌표가 없어, complex_geocode 와의
 * 조인을 DB 쪽 함수로 옮겼다.
 */
type FilterAttrs = {
  avgPriceManwon?: number;
  avgAreaM2?: number;
  buildYear?: number;
  households?: number;
};

async function fetchFilterAttrs(
  sb: ReadOnlySb,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): Promise<Map<string, FilterAttrs>> {
  const out = new Map<string, FilterAttrs>();
  const { data, error } = await sb.rpc("map_complex_attrs", {
    p_min_lat: bounds.minLat,
    p_max_lat: bounds.maxLat,
    p_min_lng: bounds.minLng,
    p_max_lng: bounds.maxLng,
    p_limit: MAX_POINTS,
  });
  /* 이 조회가 실패해도 포인트 자체는 그린다 — 속성이 없으면 필터를 켰을 때 그
     마커가 빠질 뿐이고, 마커를 통째로 못 그리는 것보다 낫다. 조용히 넘기지는 않는다. */
  if (error) {
    logger.warn("[map/clusters] map_complex_attrs 실패", { message: error.message });
    return out;
  }
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return v == null || !Number.isFinite(n) ? undefined : n;
  };
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const key = complexKey(String(r.region_name ?? ""), String(r.complex_name ?? ""));
    if (out.has(key)) continue;
    out.set(key, {
      avgPriceManwon: num(r.avg_price_manwon),
      avgAreaM2: num(r.avg_area_m2),
      buildYear: num(r.build_year),
      households: num(r.households),
    });
  }
  return out;
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

/* ── 전월세(type=rent) — 전세 평균 보증금 ─────────────────────────────
   market_transactions 에는 좌표가 없어 뷰포트 조회가 불가능하므로,
   포인트 모드에서 뷰포트 안 단지 이름 목록으로 최근 전세 실거래를 IN 조회해
   단지별 평균 보증금을 계산한다. 클러스터 모드(낮은 줌)는 이름 목록이 수천 개라
   비용이 커서 개수만 반환한다 — 전세 시세는 단지 줌에서만 표시(정직한 축소). */

/** 전세 집계 조회 기간(개월) */
const RENT_LOOKBACK_MONTHS = 24;
/** 전세 집계 소스 조회 하드캡 */
const MAX_RENT_SOURCE_ROWS = 5000;
/** IN 조회 이름 상한 (URL 길이·쿼리 비용 가드) */
const MAX_RENT_NAMES = 200;

function rentCutoffYm(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - RENT_LOOKBACK_MONTHS);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface RentBucket {
  sumDepositKrw: number;
  count: number;
  latestYm: number;
}

/**
 * 단지별 전세(보증금만 있고 월세 0) 평균 보증금 집계.
 * 실패 시 빈 맵 — 지도는 이름 마커만으로 계속 동작한다.
 */
async function fetchJeonseByComplex(
  sb: ReadOnlySb,
  pairs: { region: string; name: string }[],
): Promise<Map<string, RentBucket>> {
  const out = new Map<string, RentBucket>();
  if (pairs.length === 0) return out;
  const limited = pairs.slice(0, MAX_RENT_NAMES);
  const regions = [...new Set(limited.map((p) => p.region))];
  const names = [...new Set(limited.map((p) => p.name))];
  try {
    const { data, error } = await sb
      .from("market_transactions")
      .select("region_name,complex_name,deposit_krw,monthly_rent_krw,contract_ym")
      .eq("transaction_type", "rent")
      .eq("is_cancelled", false)
      .gt("deposit_krw", 0)
      .gte("contract_ym", rentCutoffYm())
      .in("region_name", regions)
      .in("complex_name", names)
      // 하드캡에 잘리더라도 최근 계약분이 남도록
      .order("contract_ym", { ascending: false })
      .limit(MAX_RENT_SOURCE_ROWS);
    if (error) {
      logger.warn("[map/clusters] 전세 집계 조회 실패:", error.message);
      return out;
    }
    const want = new Set(limited.map((p) => complexKey(p.region, p.name)));
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const monthly = Number(r.monthly_rent_krw ?? 0);
      if (Number.isFinite(monthly) && monthly > 0) continue; // 월세 계약 제외 — 전세 보증금 평균만
      const deposit = Number(r.deposit_krw);
      if (!Number.isFinite(deposit) || deposit <= 0) continue;
      const key = complexKey(String(r.region_name ?? ""), String(r.complex_name ?? ""));
      if (!want.has(key)) continue; // IN×IN 교차곱 오매칭 제거
      const ym = Number(r.contract_ym);
      const b = out.get(key);
      if (b) {
        b.sumDepositKrw += deposit;
        b.count += 1;
        if (Number.isFinite(ym) && ym > b.latestYm) b.latestYm = ym;
      } else {
        out.set(key, {
          sumDepositKrw: deposit,
          count: 1,
          latestYm: Number.isFinite(ym) ? ym : 0,
        });
      }
    }
    return out;
  } catch (e) {
    logger.warn(
      "[map/clusters] 전세 집계 조회 예외:",
      e instanceof Error ? e.message : String(e),
    );
    return out;
  }
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
    if (error) {
      // 조용히 삼키면 안 된다. 실제로 이 침묵 때문에 시세 색상이 운영에서
      // 통째로 죽어 있었는데(집계 뷰가 statement_timeout 을 넘겨 취소됨)
      // 지도는 아무 일 없다는 듯 회색 마커만 그렸다. 화면은 "데이터 없음"으로
      // 정직하게 물러나되, 원인은 반드시 로그에 남긴다.
      logger.warn("[map/clusters] 시세 집계 조회 실패:", error.message);
      return [];
    }
    return (data ?? []) as unknown as PriceSourceRow[];
  } catch (e) {
    logger.warn(
      "[map/clusters] 시세 집계 조회 예외:",
      e instanceof Error ? e.message : String(e),
    );
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
  /** 거래유형 — trade(매매, 기본) | rent(전월세: 전세 평균 보증금) */
  const txType = url.searchParams.get("type") === "rent" ? "rent" : "trade";

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
        // 매매 모드에서만 매매 평단가 뷰 조회 — 전세 모드는 아래 IN 집계를 쓴다
        txType === "trade" ? fetchPriceSource(sb, bounds) : Promise.resolve([]),
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

      const geoRows = ((geoRes.data ?? []) as Array<Record<string, unknown>>).filter(
        (r) =>
          r.region_name &&
          r.complex_name &&
          Number.isFinite(Number(r.lat)) &&
          Number.isFinite(Number(r.lng)),
      );

      const pairs = geoRows.map((r) => ({
        region: String(r.region_name),
        name: String(r.complex_name),
      }));

      // 전세 모드 — 뷰포트 단지들의 최근 전세 보증금 평균(단지별)
      const [jeonseByComplex, attrsByComplex] = await Promise.all([
        txType === "rent"
          ? fetchJeonseByComplex(sb, pairs)
          : Promise.resolve(new Map<string, RentBucket>()),
        fetchFilterAttrs(sb, bounds),
      ]);

      const points: MapPointItem[] = geoRows.map((r) => {
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
        const jeonse = jeonseByComplex.get(complexKey(region, name));
        if (jeonse && jeonse.count > 0) {
          point.jeonseManwon = Math.round(jeonse.sumDepositKrw / jeonse.count / 10_000);
          point.jeonseCount = jeonse.count;
        }
        // 상세 필터용 속성 — 아는 값만 붙인다(모르는 축은 필드 자체가 없다)
        const attrs = attrsByComplex.get(complexKey(region, name));
        if (attrs) {
          if (attrs.avgPriceManwon !== undefined) point.avgPriceManwon = attrs.avgPriceManwon;
          if (attrs.avgAreaM2 !== undefined) point.avgAreaM2 = attrs.avgAreaM2;
          if (attrs.buildYear !== undefined) point.buildYear = attrs.buildYear;
          if (attrs.households !== undefined) point.households = attrs.households;
        }
        return point;
      });

      // 범례 근거 — 전세 모드는 전세 집계에서, 매매 모드는 매매 뷰에서
      const priceMeta =
        txType === "rent"
          ? (() => {
              let latestYm: number | null = null;
              let txCount = 0;
              let complexCount = 0;
              for (const b of jeonseByComplex.values()) {
                txCount += b.count;
                complexCount += 1;
                if (b.latestYm > 0 && (latestYm == null || b.latestYm > latestYm)) {
                  latestYm = b.latestYm;
                }
              }
              return { latestYm, txCount, complexCount } satisfies MapPriceMeta;
            })()
          : summarizePriceMeta(priceRows);

      return NextResponse.json(
        {
          mode,
          clusters: [],
          points,
          priceMeta,
          /* 상한(MAX_POINTS)에 걸려 거래량 하위 단지가 잘렸는지 — 조용히 상위
             300개만 그리면 "이 동네 단지는 이게 전부"로 읽힌다. 잘렸으면
             잘렸다고 실어 보내 클라이언트가 "더 확대해 보세요"를 말하게 한다. */
          truncated: (geoRes.data?.length ?? 0) >= MAX_POINTS,
        },
        { headers: CACHE_HEADERS },
      );
    }

    // 클러스터 모드 — 좌표만 가져와 그리드 집계 (complex_geocode) + 셀별 실거래 평단가.
    // 전세 모드는 셀 단위 보증금 집계 비용이 커 개수만 반환한다(시세 없는 셀 = 회색).
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
      txType === "trade" ? fetchPriceSource(sb, bounds) : Promise.resolve([]),
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
      {
        mode,
        clusters,
        points: [],
        priceMeta: summarizePriceMeta(priceRows),
        /* #72 잔여 — 클러스터 모드에도 절단 신호. 소스 좌표가 하드캡(5,000)에
           걸리면 셀의 count 는 **과소집계**다(전국 뷰에서 2만여 단지가 잘린다).
           조용히 두면 "이 지역 단지 수"가 사실처럼 보인다 — 클라이언트가
           "확대하면 정확해져요"를 말하게 한다. */
        truncated: (geoRes.data?.length ?? 0) >= MAX_CLUSTER_SOURCE_ROWS,
      },
      { headers: CACHE_HEADERS },
    );
  } catch (e) {
    /* 조회 실패를 200 + 빈 배열로 돌려주지 않는다 — 그건 "이 동네에 단지가
       없다"는 거짓이고, s-maxage 로 CDN 에 5분간 굳기까지 했다. 503 + no-store 로
       "지금 못 읽었다"를 말한다. 클라이언트는 res.ok 가 아니면 기존 마커를
       유지하고 오류 상태만 표시한다(map-client.tsx clusterFetchStatus). */
    logger.error(
      "[map/clusters] 조회 실패 — 빈 지도 대신 503 으로 응답:",
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json(
      { error: "지도 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }
}
