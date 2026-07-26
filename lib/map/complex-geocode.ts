import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isNaverMapsRestConfigured, naverGeocode } from "@/lib/map/naver-maps-rest";
import { logger } from "@/lib/log";

/**
 * 단지 좌표 지오코딩 캐시 — complex_geocode 테이블.
 * market_transactions 엔 좌표가 없어, 네이버(NCP) 지오코딩 결과를 1회 저장하고 지도/허브에서 재사용.
 */
export type Coord = { lat: number; lng: number };

/** region+name 조합 키 (배치 매칭용) */
export function coordKey(region: string, name: string): string {
  return JSON.stringify([region, name]);
}

/** 캐시에서 좌표 배치 조회 (status ok 만). 반환: coordKey → Coord */
export async function getCachedCoordMap(
  pairs: { region: string; name: string }[],
): Promise<Map<string, Coord>> {
  const out = new Map<string, Coord>();
  const sb = getServiceSupabase();
  if (!sb || pairs.length === 0) return out;
  const regions = [...new Set(pairs.map((p) => p.region))];
  const names = [...new Set(pairs.map((p) => p.name))];
  const { data } = await sb
    .from("complex_geocode")
    .select("region_name, complex_name, lat, lng, status")
    .in("region_name", regions)
    .in("complex_name", names)
    .eq("status", "ok");
  const want = new Set(pairs.map((p) => coordKey(p.region, p.name)));
  for (const r of (data as
    | { region_name: string; complex_name: string; lat: number | null; lng: number | null }[]
    | null) ?? []) {
    const k = coordKey(r.region_name, r.complex_name);
    if (want.has(k) && r.lat != null && r.lng != null) {
      out.set(k, { lat: Number(r.lat), lng: Number(r.lng) });
    }
  }
  return out;
}

export type GeocodeProgress = {
  ok: number;
  notfound: number;
  cached: number;
  total: number;
  configured: boolean;
};

/** 지오코딩 진행 상황 — 관리자 데이터 페이지용 */
export async function getGeocodeProgress(): Promise<GeocodeProgress> {
  const sb = getServiceSupabase();
  const base: GeocodeProgress = {
    ok: 0,
    notfound: 0,
    cached: 0,
    total: 0,
    configured: isNaverMapsRestConfigured(),
  };
  if (!sb) return base;
  const [okRes, nfRes, totalRes] = await Promise.all([
    sb.from("complex_geocode").select("region_name", { count: "exact", head: true }).eq("status", "ok"),
    sb
      .from("complex_geocode")
      .select("region_name", { count: "exact", head: true })
      .eq("status", "notfound"),
    sb.rpc("trade_complex_total"),
  ]);
  const ok = okRes.count ?? 0;
  const notfound = nfRes.count ?? 0;
  const total = typeof totalRes.data === "number" ? totalRes.data : Number(totalRes.data ?? 0);
  return { ok, notfound, cached: ok + notfound, total, configured: base.configured };
}

/**
 * 지오코딩 1회 시도 결과 — "못 찾음"과 "오류"를 구분한다.
 * 예전 코드는 API 예외까지 삼켜 notfound 로 저장했는데, 그러면 키 미설정·쿼터 초과
 * 같은 일시 오류가 영구 실패로 캐시돼 다시는 시도되지 않는 문제가 있었다.
 */
type GeocodeAttempt =
  | { kind: "ok"; coord: Coord; query: string }
  | { kind: "notfound" }
  | { kind: "error"; message: string };

async function tryGeocode(query: string): Promise<GeocodeAttempt> {
  try {
    const items = await naverGeocode(query, 1);
    const it = items[0];
    if (it && Number.isFinite(it.lat) && Number.isFinite(it.lng)) {
      return { kind: "ok", coord: { lat: it.lat, lng: it.lng }, query };
    }
    return { kind: "notfound" }; // API는 정상 응답, 결과가 없을 뿐
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 다단 지오코딩 — 네이버 지오코더는 POI(단지명)가 아니라 "주소" 전용이라
 * "서울 송파구 리센츠" 같은 지역명+단지명 쿼리는 대부분 실패한다(실측 성공률 ~1%).
 * 그래서 주소형 쿼리(실거래 address: "서울 송파구 문정동 3")를 최우선으로 하고,
 * 실패 시 지역명+단지명 → 단지명 단독 순으로 내려간다.
 *
 * 모든 시도가 "결과 없음"이어야 notfound. 시도 중 오류가 하나라도 있고 성공이
 * 없으면 error — 호출부는 이 경우 캐시에 저장하지 않는다(다음 배치에서 재시도).
 */
async function geocodeWithFallback(queries: string[]): Promise<GeocodeAttempt> {
  let lastError: GeocodeAttempt | null = null;
  const seen = new Set<string>();
  for (const raw of queries) {
    const q = raw.trim();
    if (!q || seen.has(q)) continue;
    seen.add(q);
    const r = await tryGeocode(q);
    if (r.kind === "ok") return r;
    if (r.kind === "error") lastError = r;
  }
  return lastError ?? { kind: "notfound" };
}

/**
 * 단일 단지 좌표 확보 — 캐시 우선, 없으면 지오코딩 후 캐시 저장.
 * 지오코딩 미설정이면 캐시된 값만 반환(없으면 null).
 */
export async function geocodeAndCache(
  region: string,
  name: string,
  query?: string,
): Promise<Coord | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data: cached } = await sb
    .from("complex_geocode")
    .select("lat, lng, status")
    .eq("region_name", region)
    .eq("complex_name", name)
    .maybeSingle();
  if (cached) {
    return cached.status === "ok" && cached.lat != null && cached.lng != null
      ? { lat: Number(cached.lat), lng: Number(cached.lng) }
      : null;
  }
  if (!isNaverMapsRestConfigured()) return null;

  const attempt = await geocodeWithFallback([
    query ?? "",
    `${region} ${name}`,
    name,
  ]);
  if (attempt.kind === "error") {
    // 일시 오류를 notfound 로 굳히지 않는다 — 저장 없이 로그만
    logger.warn(`[geocode] ${region} ${name} 오류(캐시 저장 안 함): ${attempt.message}`);
    return null;
  }
  const coord = attempt.kind === "ok" ? attempt.coord : null;
  await sb.from("complex_geocode").upsert(
    {
      region_name: region,
      complex_name: name,
      query: attempt.kind === "ok" ? attempt.query : (query || `${region} ${name}`).trim(),
      lat: coord?.lat ?? null,
      lng: coord?.lng ?? null,
      status: coord ? "ok" : "notfound",
      geocoded_at: new Date().toISOString(),
    },
    { onConflict: "region_name,complex_name" },
  );
  return coord;
}

/**
 * 배치 백필(cron/관리자) — 아직 지오코딩 안 된 상위 거래량 단지 N개를 지오코딩·저장.
 * 네이버 API rate-limit 완충을 위해 호출 간 소폭 지연.
 */
export async function backfillGeocode(
  limit = 150,
): Promise<{ processed: number; ok: number; errors?: number; errorSample?: string; skipped?: boolean }> {
  const sb = getServiceSupabase();
  if (!sb) return { processed: 0, ok: 0, skipped: true };
  if (!isNaverMapsRestConfigured()) return { processed: 0, ok: 0, skipped: true };

  const { data } = await sb.rpc("complexes_needing_geocode", { p_limit: limit });
  const rows =
    (data as
      | { region_name: string; complex_name: string; address: string | null; trade_count: number }[]
      | null) ?? [];

  let ok = 0;
  let errors = 0;
  let errorSample: string | undefined;
  for (const r of rows) {
    // 주소형 쿼리 우선(네이버 지오코더는 주소 전용) → 지역+단지명 → 단지명 단독
    const attempt = await geocodeWithFallback([
      r.address ?? "",
      `${r.region_name} ${r.complex_name}`,
      r.complex_name,
    ]);
    if (attempt.kind === "error") {
      // 오류는 notfound 로 저장하지 않는다 — 다음 배치가 다시 시도한다
      errors += 1;
      if (!errorSample) errorSample = attempt.message; // 크론 로그·브리핑용 첫 사유
      logger.warn(
        `[geocode] ${r.region_name} ${r.complex_name} 오류(캐시 저장 안 함): ${attempt.message}`,
      );
      await new Promise((res) => setTimeout(res, 40));
      continue;
    }
    const coord = attempt.kind === "ok" ? attempt.coord : null;
    await sb.from("complex_geocode").upsert(
      {
        region_name: r.region_name,
        complex_name: r.complex_name,
        query:
          attempt.kind === "ok"
            ? attempt.query
            : (r.address?.trim() || `${r.region_name} ${r.complex_name}`).trim(),
        lat: coord?.lat ?? null,
        lng: coord?.lng ?? null,
        status: coord ? "ok" : "notfound",
        trade_count: r.trade_count,
        geocoded_at: new Date().toISOString(),
      },
      { onConflict: "region_name,complex_name" },
    );
    if (coord) ok += 1;
    await new Promise((res) => setTimeout(res, 40));
  }
  return { processed: rows.length, ok, errors, errorSample };
}
