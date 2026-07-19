/**
 * 단지 마스터 데이터 — Supabase CRUD
 * complexes 테이블(047 마이그레이션) 읽기/쓰기.
 * 공동주택 API(apartment-api.ts) 결과를 영구 저장하고, 이후 DB에서 빠르게 조회한다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { fetchAptComplexDetail } from "@/lib/national-data/apartment-api";
import type { AptComplexDetail } from "@/lib/national-data/apartment-api";

export interface ComplexRow {
  id: string;
  kapt_code: string | null;
  name: string;
  city: string;
  district: string;
  address: string | null;
  road_address: string | null;
  lat: number | null;
  lng: number | null;
  building_type: string;
  build_year: number | null;
  total_floors: number | null;
  households: number | null;
  parking_per_hh: number | null;
  builder_name: string | null;
  heating: string | null;
}

export interface ComplexTransactionRow {
  complex_id: string;
  yyyymm: string;
  area_m2: number | null;
  avg_manwon: number;
  min_manwon: number | null;
  max_manwon: number | null;
  deal_count: number;
  source: string;
}

// ── 단지 조회 ────────────────────────────────────────────────────────

export async function getComplexById(id: string): Promise<ComplexRow | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("complexes")
    .select("id,kapt_code,name,city,district,address,road_address,lat,lng,building_type,build_year,total_floors,households,parking_per_hh,builder_name,heating")
    .eq("id", id)
    .maybeSingle();
  return (data as ComplexRow | null) ?? null;
}

export async function getComplexByKaptCode(kaptCode: string): Promise<ComplexRow | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("complexes")
    .select("id,kapt_code,name,city,district,address,road_address,lat,lng,building_type,build_year,total_floors,households,parking_per_hh,builder_name,heating")
    .eq("kapt_code", kaptCode)
    .maybeSingle();
  return (data as ComplexRow | null) ?? null;
}

export async function searchComplexes(query: string, district?: string, limit = 20): Promise<ComplexRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb.rpc("search_complexes", {
    p_query: query ?? "",
    p_district: district ?? "",
    p_limit: limit,
  });
  return (data as ComplexRow[]) ?? [];
}

// ── 단지 저장 (upsert) ────────────────────────────────────────────────

function toSlug(name: string, district: string): string {
  // 단지명 + 구 → URL-safe ID
  const base = `${district}-${name}`.replace(/\s+/g, "-").replace(/[^가-힣a-zA-Z0-9-]/g, "");
  return base.toLowerCase().slice(0, 80);
}

export async function upsertComplexFromApi(detail: AptComplexDetail): Promise<string | null> {
  const sb = getServiceSupabase();
  if (!sb || !detail.kaptCode) return null;

  const district = detail.raw.as2 ?? "";
  const city = detail.raw.as1 ?? "";
  const id = toSlug(detail.kaptName, district);

  const row = {
    id,
    kapt_code: detail.kaptCode,
    name: detail.kaptName,
    city,
    district,
    address: detail.kaptAddr ?? null,
    road_address: detail.doroJuso ?? null,
    lat: detail.lat ? Number(detail.lat) : null,
    lng: detail.lng ? Number(detail.lng) : null,
    building_type: "아파트",
    build_year: detail.kaptUsedate ? Number(detail.kaptUsedate.slice(0, 4)) : null,
    total_floors: null,
    households: detail.hhldCnt ? Number(detail.hhldCnt) : null,
    parking_per_hh: null,
    builder_name: detail.kaptdaNm ?? null,
    heating: detail.heatSplyMthdCd ?? null,
    raw_api: detail.raw,
  };

  const { error } = await sb.from("complexes").upsert(row, { onConflict: "id" });
  if (error) {
    console.warn("[complex-store] upsert failed:", error.message);
    return null;
  }
  return id;
}

// ── 실거래가 캐시 ─────────────────────────────────────────────────────

export async function getTransactionHistory(
  complexId: string,
  limit = 12,
): Promise<ComplexTransactionRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("complex_transactions")
    .select("complex_id,yyyymm,area_m2,avg_manwon,min_manwon,max_manwon,deal_count,source")
    .eq("complex_id", complexId)
    .is("area_m2", null) // 전체 평균 (면적 구분 없음)
    .order("yyyymm", { ascending: false })
    .limit(limit);
  return ((data as ComplexTransactionRow[]) ?? []).reverse();
}

export async function upsertTransactions(rows: ComplexTransactionRow[]): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb || rows.length === 0) return;
  await sb.from("complex_transactions").upsert(rows, {
    onConflict: "complex_id,yyyymm,area_m2",
  });
}

// ── 단지별 커뮤니티 글 ─────────────────────────────────────────────────

export async function getComplexPosts(complexId: string, limit = 10) {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("posts")
    .select("id,title,created_at,district,city,like_count,comment_count,view_count")
    .eq("complex_id", complexId)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ── kaptCode로 단지 정보 확보 (캐시 우선 + API fallback) ─────────────────

export async function resolveComplexByKaptCode(kaptCode: string): Promise<{ row: ComplexRow | null; isLive: boolean }> {
  // 1. DB 캐시 조회
  const cached = await getComplexByKaptCode(kaptCode);
  if (cached) return { row: cached, isLive: false };

  // 2. 공공 API 호출 후 DB 저장
  const { detail, mode } = await fetchAptComplexDetail(kaptCode);
  if (mode === "live" && detail) {
    const id = await upsertComplexFromApi(detail);
    if (id) {
      const fresh = await getComplexById(id);
      return { row: fresh, isLive: true };
    }
  }
  return { row: null, isLive: false };
}
