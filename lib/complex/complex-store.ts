/**
 * 단지(complex) 데이터 — 실거래(market_transactions) 기반.
 *
 * 배경(사실 우선): 과거엔 `complexes`/`complex_transactions` 테이블을 가정했으나
 * 운영 DB엔 존재하지 않아 단지 허브가 항상 목업이었다. 실데이터는 국토교통부 실거래
 * `market_transactions`(complex_name·region_name·contract_ym·deal_amount_krw)에 있으므로
 * 단지 식별자를 base64url(region_name + SEP + complex_name)로 인코딩해 이 테이블을 단지처럼 조회한다.
 * 좌표(lat/lng)는 실거래에 없어 기본 null → 거리뷰·지도 마커는 자동 숨김.
 * 단, apt-detail-enrich 크론이 대장 마스터 metadata 에 좌표를 백필하므로,
 * D7 매칭이 성공한 단지는 아래 enrich 에서 좌표·건설사가 채워진다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { AREA_BANDS } from "@/lib/market/bands";
import { APT_MASTER_SOURCE_KEY } from "@/lib/complex/apartment-master";

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

// ── 단지 식별자 인코딩/디코딩 ─────────────────────────────────────────
/** region_name / complex_name 구분자 — 이름·지역에 나타나지 않는 제어문자(U+0001) */
const SEP = String.fromCharCode(1);

/** region_name + complex_name → URL-safe id */
export function encodeComplexId(region: string, name: string): string {
  return Buffer.from(`${region}${SEP}${name}`, "utf8").toString("base64url");
}

/** id → { region, name } (실패 시 null) */
export function decodeComplexId(id: string): { region: string; name: string } | null {
  try {
    const raw = Buffer.from(id, "base64url").toString("utf8");
    const idx = raw.indexOf(SEP);
    if (idx < 0) return null;
    const region = raw.slice(0, idx);
    const name = raw.slice(idx + 1);
    if (!region || !name) return null;
    return { region, name };
  } catch {
    return null;
  }
}

/** region_name("서울 송파구"·"광명시")을 city/district로 분해 */
function splitRegion(region: string): { city: string; district: string } {
  const parts = region.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { city: region, district: region };
  if (parts.length === 1) return { city: parts[0], district: parts[0] };
  return { city: parts[0], district: parts.slice(1).join(" ") };
}

function toComplexRow(
  region: string,
  name: string,
  sample: { address?: string | null; build_year?: number | null } = {},
): ComplexRow {
  const { city, district } = splitRegion(region);
  return {
    id: encodeComplexId(region, name),
    kapt_code: null,
    name,
    city,
    district,
    address: sample.address?.trim() || null,
    road_address: null,
    lat: null,
    lng: null,
    building_type: "아파트",
    build_year: sample.build_year ?? null,
    total_floors: null,
    households: null,
    parking_per_hh: null,
    builder_name: null,
    heating: null,
  };
}

// ── 단지 조회 ────────────────────────────────────────────────────────

/** 단지명 정규화 — 공백 제거 + 후행 "아파트" 제거 (모델 간 name-매칭 기준). */
function normalizeComplexName(s: string): string {
  return s.replace(/\s+/g, "").replace(/아파트$/, "");
}

type AptEnrich = {
  kaptCode: string | null;
  buildYear: number | null;
  heating: string | null;
  roadAddress: string | null;
  builder: string | null;
  /** 좌표 — apt-detail-enrich 크론이 백필한 metadata.lat/lng. 둘 다 있을 때만 채운다. */
  lat: number | null;
  lng: number | null;
};

/**
 * D7 — market_transactions(complex_name) ↔ apartment_complexes(name) 정합.
 * 실거래 단지명은 브랜드 기본형("리센츠")인데 대장 마스터는 접두/접미가 붙는다("잠실리센츠",
 * "헬리오시티아파트"). 시군구로 스코프하고 name ILIKE %기본형% (정방향 포함)으로 매칭한 뒤
 * 정규화 완전일치·최단 이름을 최적 매칭으로 골라 metadata(세대·준공·난방 등)를 뽑는다.
 * 조회 실패/무매칭 시 null(허브는 실거래만으로 graceful).
 *
 * source_key 스코프를 명시한 이유 — apartment_complexes 의 45%(17,704행)는 단지가 아니라
 * REB 이름 별칭·ID 레코드이고, 여기서 뽑으려는 네 필드(kaptCode·approvalDate·heating·
 * roadAddress)를 하나도 갖고 있지 않다. 지금까지는 아래 address 필터가 우연히 이들을
 * 걸러줬다 — 별칭 행은 address 가 빈 문자열이라 `%시군구%` 에 걸릴 수 없기 때문이다.
 * 하지만 그건 의도가 아니라 부수효과라, region 이 빈 문자열이면(district 가 falsy)
 * address 필터 자체가 사라지면서 별칭 행이 그대로 후보에 들어온다. 그때 아래 점수식은
 * 정규화 이름이 완전일치하면 0점을 주므로, 아무 정보도 없는 별칭 행이 진짜 마스터
 * ("잠실리센츠": 1000점대)를 이기고 뽑혀 enrich 가 조용히 전부 null 을 돌려준다.
 * .limit(25) 가 관련도 정렬보다 먼저 걸리는 것도 같은 이유로 위험하다.
 * 의도를 코드로 적는 편이 낫다.
 */
async function enrichFromApartmentComplex(
  region: string,
  name: string,
): Promise<AptEnrich | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { district } = splitRegion(region); // 시군구 (예: 송파구)
  const core = normalizeComplexName(name).replace(/[%_]/g, "");
  if (core.length < 2) return null;

  let q = sb
    .from("apartment_complexes")
    .select("name, metadata")
    .eq("source_key", APT_MASTER_SOURCE_KEY)
    .ilike("name", `%${core}%`)
    .limit(25);
  if (district) q = q.ilike("address", `%${district}%`);
  const { data } = await q;
  const rows =
    (data as { name: string; metadata: Record<string, unknown> | null }[] | null) ?? [];
  if (rows.length === 0) return null;

  // 최적 매칭: 정규화 완전일치 우선 → 이름 길이 근접(기본형에 가장 가까운 것).
  const target = normalizeComplexName(name);
  let best = rows[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const r of rows) {
    const rn = normalizeComplexName(r.name);
    const score = (rn === target ? 0 : 1000) + Math.abs(rn.length - target.length);
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }

  const m = best.metadata ?? {};
  const approval = typeof m.approvalDate === "string" ? m.approvalDate : "";
  const buildYear = /^\d{8}$/.test(approval) ? Number(approval.slice(0, 4)) : null;
  const lat = typeof m.lat === "number" && Number.isFinite(m.lat) ? m.lat : null;
  const lng = typeof m.lng === "number" && Number.isFinite(m.lng) ? m.lng : null;
  const hasCoord = lat != null && lng != null;
  // 주의: metadata.householdCount 는 소스 품질 문제로 상당수 과대(중앙값 4천대)라 사용하지 않는다.
  return {
    kaptCode: typeof m.kaptCode === "string" ? m.kaptCode : null,
    buildYear,
    heating: typeof m.heating === "string" ? m.heating : null,
    roadAddress: typeof m.roadAddress === "string" ? m.roadAddress : null,
    builder: typeof m.builder === "string" ? m.builder : null,
    lat: hasCoord ? lat : null,
    lng: hasCoord ? lng : null,
  };
}

export async function getComplexById(id: string): Promise<ComplexRow | null> {
  const dec = decodeComplexId(id);
  if (!dec) return null;
  const sb = getServiceSupabase();
  if (!sb) return null;
  // 이 단지의 매매 실거래가 1건이라도 있으면 실재하는 단지로 간주 (대표 정보 도출)
  const { data } = await sb
    .from("market_transactions")
    .select("address, build_year")
    .eq("complex_name", dec.name)
    .eq("region_name", dec.region)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .order("build_year", { ascending: false, nullsFirst: false })
    .limit(1);
  const row = (data as { address: string | null; build_year: number | null }[] | null)?.[0];
  if (!row) return null;

  const base = toComplexRow(dec.region, dec.name, row);
  // D7 — 대장 마스터(apartment_complexes) 매칭 enrich (세대수·준공·난방·도로명·kapt).
  const apt = await enrichFromApartmentComplex(dec.region, dec.name).catch(() => null);
  if (apt) {
    base.kapt_code = apt.kaptCode ?? base.kapt_code;
    base.build_year = base.build_year ?? apt.buildYear; // 실거래 build_year 우선
    base.heating = apt.heating ?? base.heating;
    base.road_address = apt.roadAddress ?? base.road_address;
    base.builder_name = apt.builder ?? base.builder_name;
    if (apt.lat != null && apt.lng != null) {
      base.lat = apt.lat;
      base.lng = apt.lng;
    }
  }
  return base;
}

export async function getComplexByKaptCode(_kaptCode: string): Promise<ComplexRow | null> {
  // K-apt 코드↔실거래 매핑은 별도 파이프라인 필요 — 현재 미지원 (허위 반환 금지)
  return null;
}

export async function searchComplexes(
  query: string,
  district?: string,
  limit = 20,
): Promise<ComplexRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  let q = sb
    .from("market_transactions")
    .select("complex_name, region_name, address, build_year")
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .not("complex_name", "is", null);

  const term = (query ?? "").trim();
  if (term) q = q.ilike("complex_name", `%${term}%`);
  const dist = (district ?? "").trim();
  if (dist) q = q.ilike("region_name", `%${dist}%`);

  // 넉넉히 가져와 (region_name, complex_name) 기준 중복 제거
  // (ilike 는 complex_name trigram GIN 인덱스를 탄다)
  const { data } = await q.order("contract_ym", { ascending: false }).limit(800);
  const rows =
    (data as
      | {
          complex_name: string;
          region_name: string;
          address: string | null;
          build_year: number | null;
        }[]
      | null) ?? [];

  // 랭킹: 정확일치 > 접두 > 포함 — 같은 등급 안에서는 최근 거래량(조회분 내 출현 건수) 많은 순.
  // "래미안" 검색 시 우연히 최근 거래된 "OO래미안2차"가 "래미안"보다 위로 오는 문제를 막는다.
  const normTerm = term.replace(/\s+/g, "").toLowerCase();
  const seen = new Map<string, { row: ComplexRow; tier: number; txCount: number }>();
  for (const r of rows) {
    if (!r.complex_name || !r.region_name) continue;
    const key = `${r.region_name}${SEP}${r.complex_name}`;
    const cur = seen.get(key);
    if (cur) {
      cur.txCount += 1; // 최근 800건 내 출현 횟수 = 거래량 가중치
      continue;
    }
    const normName = r.complex_name.replace(/\s+/g, "").toLowerCase();
    const tier = !normTerm
      ? 2
      : normName === normTerm
        ? 0
        : normName.startsWith(normTerm)
          ? 1
          : 2;
    seen.set(key, { row: toComplexRow(r.region_name, r.complex_name, r), tier, txCount: 1 });
  }
  return [...seen.values()]
    .sort((a, b) => a.tier - b.tier || b.txCount - a.txCount)
    .slice(0, limit)
    .map((e) => e.row);
}

/**
 * A8 — 검색 무결과 대안 제안. 정확 매칭이 실패했을 때, 질의를 토큰으로 쪼개
 * complex_name/region_name 어느 한 쪽이라도 포함하는 실거래 단지를 폭넓게 추천한다.
 * (searchComplexes 는 전체 질의 contains 라 "래미안 강남" 같은 조합은 못 잡음 → 토큰 OR 로 보완)
 */
export async function suggestComplexes(query: string, limit = 6): Promise<ComplexRow[]> {
  const sb = getServiceSupabase();
  const raw = (query ?? "").trim();
  if (!sb || !raw) return [];
  // 토큰 정제(한글·영숫자만, 2자 이상, 최대 3개) — PostgREST or 필터 안전.
  const tokens = [
    ...new Set(
      raw
        .split(/\s+/)
        .map((t) => t.replace(/[^0-9A-Za-z가-힣]/g, ""))
        .filter((t) => t.length >= 2),
    ),
  ].slice(0, 3);
  if (tokens.length === 0) return [];

  const ors = tokens
    .flatMap((t) => [`complex_name.ilike.%${t}%`, `region_name.ilike.%${t}%`])
    .join(",");
  const { data } = await sb
    .from("market_transactions")
    .select("complex_name, region_name, address, build_year")
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .not("complex_name", "is", null)
    .or(ors)
    .order("contract_ym", { ascending: false })
    .limit(400);

  const rows =
    (data as
      | {
          complex_name: string;
          region_name: string;
          address: string | null;
          build_year: number | null;
        }[]
      | null) ?? [];
  const seen = new Map<string, ComplexRow>();
  for (const r of rows) {
    if (!r.complex_name || !r.region_name) continue;
    const key = `${r.region_name}${SEP}${r.complex_name}`;
    if (seen.has(key)) continue;
    seen.set(key, toComplexRow(r.region_name, r.complex_name, r));
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

// ── 지역 대비 상대 위치 (D6) ──────────────────────────────────────────

export interface RegionRelative {
  district: string;
  complexPerM2Manwon: number;
  districtPerM2Manwon: number;
  deltaPct: number;
  saleChangePct: number | null;
  jeonseRatio: number | null;
  period: string | null;
}

/**
 * 단지 ㎡당 시세를 소재 구 평균(market_region_price, REB 실집계)과 비교(D6).
 * 면적 정규화(㎡당)로 프리미엄/디스카운트를 공정 비교. 데이터 없으면 null.
 */
export async function getRegionRelative(complexId: string): Promise<RegionRelative | null> {
  const dec = decodeComplexId(complexId);
  if (!dec) return null;
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { district } = splitRegion(dec.region);
  if (!district) return null;

  const { data: reg } = await sb
    .from("market_region_price")
    .select("per_m2_sale, sale_change, jeonse_ratio, period")
    .eq("region_name", district)
    .order("period", { ascending: false })
    .limit(1)
    .maybeSingle();
  const districtPerM2 = reg?.per_m2_sale != null ? Number(reg.per_m2_sale) : 0;
  if (!Number.isFinite(districtPerM2) || districtPerM2 <= 0) return null;

  const { data: tx } = await sb
    .from("market_transactions")
    .select("deal_amount_krw, area_m2")
    .eq("complex_name", dec.name)
    .eq("region_name", dec.region)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .gt("deal_amount_krw", 0)
    .not("area_m2", "is", null)
    .order("contract_ym", { ascending: false })
    .limit(60);
  const rows = (tx as { deal_amount_krw: number; area_m2: number }[] | null) ?? [];
  const perM2s = rows
    .map((r) => Number(r.deal_amount_krw) / Number(r.area_m2))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (perM2s.length === 0) return null;
  const complexPerM2 = perM2s.reduce((s, v) => s + v, 0) / perM2s.length;
  const deltaPct = Math.round(((complexPerM2 - districtPerM2) / districtPerM2) * 1000) / 10;

  return {
    district,
    complexPerM2Manwon: Math.round(complexPerM2 / 10000),
    districtPerM2Manwon: Math.round(districtPerM2 / 10000),
    deltaPct,
    saleChangePct: reg?.sale_change != null ? Number(reg.sale_change) : null,
    jeonseRatio: reg?.jeonse_ratio != null ? Math.round(Number(reg.jeonse_ratio) * 10) / 10 : null,
    period: reg?.period ? String(reg.period) : null,
  };
}

// ── 면적대별 시세 (D5) ────────────────────────────────────────────────

export interface AreaBandRow {
  label: string;
  count: number;
  latestManwon: number;
  latestYm: string;
  avgManwon: number;
}

/* 구간표는 lib/market/bands.ts 한 곳에만 둔다 (A5) — 여기 있던 사본은 제거했다. */

/**
 * 단지 면적대별 시세 요약 — 허브 승격용(D5). 최근 거래 기준 면적 구간별 최근가·평균가.
 * market_transactions(디코드 name+region) 최근 400건에서 집계. 실거래 없으면 빈 배열.
 */
export async function getAreaBands(complexId: string): Promise<AreaBandRow[]> {
  const dec = decodeComplexId(complexId);
  if (!dec) return [];
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("market_transactions")
    .select("area_m2, deal_amount_krw, contract_ym")
    .eq("complex_name", dec.name)
    .eq("region_name", dec.region)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .gt("deal_amount_krw", 0)
    .not("area_m2", "is", null)
    .order("contract_ym", { ascending: false })
    .limit(400);
  const rows =
    (data as { area_m2: number | null; deal_amount_krw: number; contract_ym: string }[] | null) ??
    [];
  if (rows.length === 0) return [];

  const out: AreaBandRow[] = [];
  for (const band of AREA_BANDS) {
    const inBand = rows.filter(
      (r) => r.area_m2 != null && r.area_m2 >= band.min && r.area_m2 < band.max,
    );
    if (inBand.length === 0) continue;
    const latest = inBand[0]; // 최신순 정렬됨
    const avgKrw = inBand.reduce((s, r) => s + Number(r.deal_amount_krw), 0) / inBand.length;
    out.push({
      label: band.label,
      count: inBand.length,
      latestManwon: Math.round(Number(latest.deal_amount_krw) / 10000),
      latestYm: String(latest.contract_ym),
      avgManwon: Math.round(avgKrw / 10000),
    });
  }
  return out;
}

// ── 실거래가 (market_transactions 월별 집계) ──────────────────────────

/**
 * 단지 월별 실거래 추이. 해제(취소) 신고된 계약은 제외한다(is_cancelled=false).
 *
 * 해제분은 행 자체는 남아 있다 — 해제됐다는 사실도 데이터이기 때문이다. 다만
 * "이 단지가 얼마에 거래됐나"를 묻는 화면에는 들어가면 안 된다. 실측(2026-07-25)
 * 기준 매매 22,869행 중 402행이 해제분이었고, 321개 단지의 평균가를 최대 21.7%
 * 움직이고 있었다. — #150
 */
export async function getTransactionHistory(
  complexId: string,
  limit = 12,
): Promise<ComplexTransactionRow[]> {
  const dec = decodeComplexId(complexId);
  if (!dec) return [];
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("market_transactions")
    .select("contract_ym, deal_amount_krw")
    .eq("complex_name", dec.name)
    .eq("region_name", dec.region)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .gt("deal_amount_krw", 0);

  const rows = (data as { contract_ym: string; deal_amount_krw: number }[] | null) ?? [];
  const byYm = new Map<string, { sum: number; n: number; min: number; max: number }>();
  for (const r of rows) {
    const ym = r.contract_ym;
    const amt = Number(r.deal_amount_krw);
    if (!ym || !Number.isFinite(amt) || amt <= 0) continue;
    const cur = byYm.get(ym) ?? { sum: 0, n: 0, min: amt, max: amt };
    cur.sum += amt;
    cur.n += 1;
    cur.min = Math.min(cur.min, amt);
    cur.max = Math.max(cur.max, amt);
    byYm.set(ym, cur);
  }

  // 만원 단위 변환(원→만원) + 과거→최신 정렬, 최근 limit개월
  return [...byYm.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-limit)
    .map(([ym, v]) => ({
      complex_id: complexId,
      yyyymm: ym,
      area_m2: null,
      avg_manwon: Math.round(v.sum / v.n / 10_000),
      min_manwon: Math.round(v.min / 10_000),
      max_manwon: Math.round(v.max / 10_000),
      deal_count: v.n,
      source: "molit",
    }));
}

export async function upsertTransactions(_rows: ComplexTransactionRow[]): Promise<void> {
  // 실거래 적재는 market_transactions ETL(molit-transactions-ingest)이 담당 — 여기선 no-op
  return;
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
