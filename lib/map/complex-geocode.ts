import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isNaverMapsRestConfigured, naverGeocode } from "@/lib/map/naver-maps-rest";

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

async function geocodeQuery(query: string): Promise<Coord | null> {
  try {
    const items = await naverGeocode(query, 1);
    const it = items[0];
    if (it && Number.isFinite(it.lat) && Number.isFinite(it.lng)) {
      return { lat: it.lat, lng: it.lng };
    }
  } catch {
    return null;
  }
  return null;
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

  const q = (query || `${region} ${name}`).trim();
  const coord = await geocodeQuery(q);
  await sb.from("complex_geocode").upsert(
    {
      region_name: region,
      complex_name: name,
      query: q,
      lat: coord?.lat ?? null,
      lng: coord?.lng ?? null,
      status: coord ? "ok" : "notfound",
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
): Promise<{ processed: number; ok: number; skipped?: boolean }> {
  const sb = getServiceSupabase();
  if (!sb) return { processed: 0, ok: 0, skipped: true };
  if (!isNaverMapsRestConfigured()) return { processed: 0, ok: 0, skipped: true };

  const { data } = await sb.rpc("complexes_needing_geocode", { p_limit: limit });
  const rows =
    (data as
      | { region_name: string; complex_name: string; address: string | null; trade_count: number }[]
      | null) ?? [];

  let ok = 0;
  for (const r of rows) {
    const q = (r.address?.trim() || `${r.region_name} ${r.complex_name}`).trim();
    const coord = await geocodeQuery(q);
    await sb.from("complex_geocode").upsert(
      {
        region_name: r.region_name,
        complex_name: r.complex_name,
        query: q,
        lat: coord?.lat ?? null,
        lng: coord?.lng ?? null,
        status: coord ? "ok" : "notfound",
        trade_count: r.trade_count,
      },
      { onConflict: "region_name,complex_name" },
    );
    if (coord) ok += 1;
    await new Promise((res) => setTimeout(res, 40));
  }
  return { processed: rows.length, ok };
}
