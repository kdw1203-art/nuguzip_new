import "server-only";
import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/service";
import { SEOUL_DISTRICTS, METRO_EXPLORE_DISTRICTS } from "@/lib/map/seoul-districts";

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
    });
  }
  return out;
}

/** 지도 SSR이 force-dynamic 이어도 시세 마커는 10분 캐시 */
export const loadRegionMarketMarkers = unstable_cache(
  loadRegionMarketMarkersUncached,
  ["map-region-market-markers-v1"],
  { revalidate: 600, tags: ["map-region-markers"] },
);
