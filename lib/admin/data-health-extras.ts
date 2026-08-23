import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* [#97] 데이터 헬스 통합 — 신선도 표(기존) 옆에 붙는 보조 지표 2종.
 *  · 지오코딩 커버리지: 단지 마스터 대비 좌표 확보율(지도 표시 가능 비율)
 *  · 최근 24시간 수집 로그 요약: 소스별 ok/skipped/error 건수
 * 조회 실패는 null — "0%"·"0건"으로 위장하지 않는다. */

export type GeocodeCoverage = { complexes: number; geocoded: number; pct: number };

export async function loadGeocodeCoverage(): Promise<GeocodeCoverage | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const [c1, c2] = await Promise.all([
      sb.from("apartment_complexes").select("id", { count: "exact", head: true }),
      sb.from("complex_geocode").select("complex_id", { count: "exact", head: true }),
    ]);
    if (c1.error || c2.error || typeof c1.count !== "number" || typeof c2.count !== "number") {
      logger.error("[data-health] 지오코딩 커버리지 조회 실패", c1.error ?? c2.error);
      return null;
    }
    if (c1.count === 0) return { complexes: 0, geocoded: c2.count, pct: 0 };
    return {
      complexes: c1.count,
      geocoded: c2.count,
      pct: Math.round((Math.min(c2.count, c1.count) / c1.count) * 1000) / 10,
    };
  } catch (e) {
    logger.error("[data-health] 지오코딩 커버리지", e);
    return null;
  }
}

export type IngestLogSummaryRow = {
  source: string;
  ok: number;
  skipped: number;
  error: number;
  lastMessage: string | null;
};

export async function loadIngestLogSummary24h(): Promise<IngestLogSummaryRow[] | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("market_ingest_log")
      .select("source, status, message, created_at")
      .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(400);
    if (error || !Array.isArray(data)) {
      logger.error("[data-health] 수집 로그 조회 실패", error ?? "invalid");
      return null;
    }
    const map = new Map<string, IngestLogSummaryRow>();
    for (const r of data as Array<Record<string, unknown>>) {
      const source = String(r.source ?? "기타");
      const row =
        map.get(source) ?? { source, ok: 0, skipped: 0, error: 0, lastMessage: null };
      const status = String(r.status ?? "");
      if (status === "ok") row.ok += 1;
      else if (status === "skipped") row.skipped += 1;
      else if (status === "error") row.error += 1;
      if (row.lastMessage === null && r.message) row.lastMessage = String(r.message).slice(0, 120);
      map.set(source, row);
    }
    return [...map.values()].sort((a, b) => b.error - a.error || b.ok - a.ok);
  } catch (e) {
    logger.error("[data-health] 수집 로그 요약", e);
    return null;
  }
}
