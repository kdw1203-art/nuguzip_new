import "server-only";
import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/service";
import { listLatestTemperatures } from "@/lib/market/temperature-archive";
import { logger } from "@/lib/log";
import { SEOUL_DISTRICTS, METRO_EXPLORE_DISTRICTS } from "@/lib/map/seoul-districts";
import { saveLastGood, loadLastGood } from "@/lib/cache/last-good";

/**
 * 지역(구/시) 단위 실시세 마커 — 한국부동산원(REB) 집계 `market_region_price` 실데이터.
 * region_id 로 좌표(SEOUL_DISTRICTS·METRO_EXPLORE_DISTRICTS)와 조인해 지도에 시세 버블로 표시.
 * 사실 우선: 좌표가 없는 지역은 조용히 제외(허위 위치 금지). 실패 시 빈 배열.
 */
export type RegionMarketMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** 평균 매매가 (만원) */
  avgManwon: number;
  /** ㎡당 (만원) — 없으면 null */
  perM2Manwon: number | null;
  /** 전월 대비 변동률(%) — 없으면 null */
  changePct: number | null;
  /** 최근 집계 거래 건수 */
  tradeCount: number;
  /** 전세가율(%) — 없으면 null */
  jeonseRatio: number | null;
  /** 기준월 "YYYYMM" */
  period: string;
  /** [지도확장 2026-08-31] 주간 시장 온도(0~100 · 50 중립) — 아카이브 없으면 null */
  tempScore: number | null;
  /** 온도 기준 주 시작일 (YYYY-MM-DD) — 시점 없는 숫자는 지어낸 값과 같다 */
  tempWeek: string | null;
};

type CoordEntry = { lat: number; lng: number; name: string };

function coordIndex(): Map<string, CoordEntry> {
  const idx = new Map<string, CoordEntry>();
  for (const d of [...SEOUL_DISTRICTS, ...METRO_EXPLORE_DISTRICTS]) {
    idx.set(d.id, { lat: d.lat, lng: d.lng, name: d.name });
  }
  return idx;
}

interface RegionPriceRow {
  region_id: string;
  region_name: string | null;
  avg_sale: number | null;
  per_m2_sale: number | null;
  sale_change: number | null;
  trade_count: number | null;
  jeonse_ratio: number | null;
  period: string;
}

async function loadRegionMarketMarkersUncached(): Promise<RegionMarketMarker[]> {
  /* 실패는 던지고 호출부(app/map/page.tsx)가 안내 문구로 구분한다. */
  const sb = getServiceSupabase();
  if (!sb) {
    throw new Error("[region-market] Supabase 서비스 클라이언트를 만들 수 없습니다 (환경변수 누락)");
  }
  const { data, error } = await sb
    .from("market_region_price")
    .select(
      "region_id, region_name, avg_sale, per_m2_sale, sale_change, trade_count, jeonse_ratio, period, property_type",
    )
    .eq("property_type", "apt")
    .order("period", { ascending: false });
  if (error) throw new Error(`market_region_price 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("market_region_price 응답이 배열이 아닙니다");

  const rows = data as RegionPriceRow[];
  const coords = coordIndex();
  const seen = new Set<string>();
  const out: RegionMarketMarker[] = [];

  /* [지도확장] 주간 시장 온도 조인 — 아카이브 조회가 실패해도 시세 마커는
     그대로 나간다(온도만 null). 온도는 부가 정보라 시세를 볼모로 잡지 않는다. */
  const tempByRegion = new Map<string, { score: number; week: string }>();
  try {
    const t = await listLatestTemperatures();
    for (const row of t.rows) {
      tempByRegion.set(row.current.regionId, {
        score: row.current.score,
        week: row.current.weekStart,
      });
    }
  } catch (e) {
    logger.warn("[region-market] 시장 온도 조인 실패 — 온도 없이 계속", e);
  }

  for (const r of rows) {
    if (!r.region_id || seen.has(r.region_id)) continue; // period 내림차순 → 첫 등장이 최신월
    const c = coords.get(r.region_id);
    if (!c) continue; // 좌표 미보유 지역 제외 (허위 위치 금지)
    const avg = Number(r.avg_sale);
    if (!Number.isFinite(avg) || avg <= 0) continue;
    seen.add(r.region_id);
    out.push({
      id: r.region_id,
      name: (r.region_name ?? c.name) || c.name,
      lat: c.lat,
      lng: c.lng,
      avgManwon: Math.round(avg / 10_000),
      perM2Manwon:
        r.per_m2_sale && Number(r.per_m2_sale) > 0
          ? Math.round(Number(r.per_m2_sale) / 10_000)
          : null,
      changePct: r.sale_change != null ? Number(r.sale_change) : null,
      tradeCount: r.trade_count ?? 0,
      jeonseRatio: r.jeonse_ratio != null ? Number(r.jeonse_ratio) : null,
      period: r.period,
      tempScore: tempByRegion.get(r.region_id)?.score ?? null,
      tempWeek: tempByRegion.get(r.region_id)?.week ?? null,
    });
  }
  return out;
}

const REGION_MARKET_LKG_KEY = "map:region-market-markers-v1";

/* [938 · B007] DB 포화 시간대 타임아웃(실측 1건/24h)은 마지막 정상본으로 잇는다.
   REB 집계는 하루 한 번 갱신되는 공용 데이터라 몇 시간 전 정상본이
   "시세 마커 없음"보다 사실에 가깝다. 정상본이 없거나 이틀 넘게 낡았으면
   예전처럼 던져서 호출부가 안내 문구로 구분한다. */
async function loadRegionMarketMarkersDurable(): Promise<RegionMarketMarker[]> {
  try {
    const fresh = await loadRegionMarketMarkersUncached();
    await saveLastGood(REGION_MARKET_LKG_KEY, fresh);
    return fresh;
  } catch (err) {
    const lkg = await loadLastGood<RegionMarketMarker[]>(REGION_MARKET_LKG_KEY, 48);
    if (lkg && Array.isArray(lkg.value) && lkg.value.length > 0) {
      logger.warn("[region-market] 조회 실패 — 마지막 정상본으로 대체", {
        fetchedAt: lkg.fetchedAt,
        cause: err instanceof Error ? err.message : String(err),
      });
      return lkg.value;
    }
    throw err;
  }
}

/** 지도 SSR이 force-dynamic 이어도 시세 마커는 10분 캐시 */
export const loadRegionMarketMarkers = unstable_cache(
  loadRegionMarketMarkersDurable,
  ["map-region-market-markers-v1"],
  { revalidate: 600, tags: ["map-region-markers"] },
);
