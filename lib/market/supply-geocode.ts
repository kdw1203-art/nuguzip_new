import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { geocodeAndCache } from "@/lib/map/complex-geocode";
import { logger } from "@/lib/log";

/* [#74] 입주 예정 단지 좌표 채우기 — 기존 complex_geocode 파이프라인 재사용.
 * 수집 크론(supply-ingest) 끝에 하루 상한(기본 25건)만큼 점진 백필한다.
 * notfound 로 굳은 키는 다시 시도하지 않는다(geocodeAndCache 캐시 정책 그대로).
 */

export type SupplyGeocodeResult = {
  candidates: number;
  attempted: number;
  ok: number;
  notfound: number;
};

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function backfillSupplyGeocode(cap = 25): Promise<SupplyGeocodeResult> {
  const sb = getServiceSupabase();
  const empty: SupplyGeocodeResult = { candidates: 0, attempted: 0, ok: 0, notfound: 0 };
  if (!sb) return empty;

  const { data, error } = await sb
    .from("apartment_supply")
    .select("region, apt_name, address")
    .gte("move_in_ym", currentYm())
    .not("apt_name", "is", null)
    .order("move_in_ym", { ascending: true })
    .limit(600);
  if (error) throw new Error(`apartment_supply 조회 실패: ${error.message}`);

  // (region, name) 중복 제거
  const seen = new Set<string>();
  const rows: Array<{ region: string; name: string; address: string | null }> = [];
  for (const r of data ?? []) {
    const region = String(r.region ?? "").trim();
    const name = String(r.apt_name ?? "").trim();
    if (!region || !name) continue;
    const k = `${region}${name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push({ region, name, address: r.address ? String(r.address) : null });
  }
  if (rows.length === 0) return empty;

  // 이미 시도한 키(성공·notfound 불문)는 후보에서 뺀다 — cap 은 실제 API 시도 수
  const { data: existing, error: exErr } = await sb
    .from("complex_geocode")
    .select("region_name, complex_name")
    .in("region_name", [...new Set(rows.map((r) => r.region))])
    .in("complex_name", [...new Set(rows.map((r) => r.name))]);
  if (exErr) throw new Error(`complex_geocode 조회 실패: ${exErr.message}`);
  const done = new Set(
    (existing ?? []).map((r) => `${r.region_name}${r.complex_name}`),
  );
  const todo = rows.filter((r) => !done.has(`${r.region}${r.name}`));

  const result: SupplyGeocodeResult = {
    candidates: todo.length,
    attempted: 0,
    ok: 0,
    notfound: 0,
  };
  for (const r of todo.slice(0, cap)) {
    result.attempted += 1;
    try {
      const coord = await geocodeAndCache(
        r.region,
        r.name,
        r.address ? r.address : undefined,
      );
      if (coord) result.ok += 1;
      else result.notfound += 1;
    } catch (e) {
      logger.warn(`[supply-geocode] ${r.region} ${r.name} 실패`, e);
      result.notfound += 1;
    }
  }
  return result;
}
