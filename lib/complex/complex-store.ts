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
import { logger } from "@/lib/log";

/**
 * 조회 실패는 던진다 — "없음"으로 답하지 않는다.
 *
 * 이 파일의 함수들은 예전에 `const { data } = await …` 로 error 를 버렸다.
 * 그러면 조회가 실패했을 때 data 가 null 이라 빈 배열·null 이 나가고, 화면은
 * 그것을 "실거래가 없는 단지", "면적대별 시세 없음", "검색 결과 없음"으로
 * 그린다. 특히 getComplexById 는 null 이 곧 notFound() 인데
 * app/complex/[id]/page.tsx 는 `export const revalidate = 120` 인 ISR 이라,
 * 한 번의 조회 실패가 "그런 단지는 없습니다" 404 를 2분간 캐시에 얼려 넣는다.
 * 5xx 는 캐시되지 않으므로, 못 읽었으면 던지는 편이 사실에 가깝고 안전하다.
 *
 * 부르는 쪽 규칙:
 *   - 페이지(app/complex/[id], app/embed/complex/[id]) — 핵심은 그대로 던져
 *     5xx, 곁가지 섹션은 settle()/try 로 받아 "못 불러왔어요"를 따로 그린다.
 *   - API 라우트 — dbUnavailable() 로 503 + Retry-After. 404·빈 배열 금지.
 * `!sb`(env 미설정) 는 여기 해당하지 않는다 — 그건 실패가 아니라 미설정이다.
 */
function dbError(where: string, err: { message?: string } | null): Error {
  return new Error(`${where} 조회 실패: ${err?.message ?? "알 수 없는 오류"}`);
}

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
  /** 동 수 — V4 상세(detailFetchedAt) 있을 때만 */
  building_count: number | null;
  /** 총 주차 대수 — V4 상세 있을 때만 */
  parking_count: number | null;
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

/**
 * K-apt 코드 기반 id — 동명 단지 병합 리스크를 줄이기 위한 v2.
 * 기존 name id(`/complex/{base64}`)는 그대로 유효하고, kapt 가 있으면 이 형태를 우선한다.
 */
export const KAPT_COMPLEX_ID_PREFIX = "kapt.";

/** region_name + complex_name → URL-safe id */
export function encodeComplexId(region: string, name: string): string {
  return Buffer.from(`${region}${SEP}${name}`, "utf8").toString("base64url");
}

/** K-apt 코드 → 안정적 URL id (동명 충돌 회피) */
export function encodeKaptComplexId(kaptCode: string): string {
  const code = kaptCode.trim().toUpperCase();
  return `${KAPT_COMPLEX_ID_PREFIX}${code}`;
}

export type ParsedComplexId =
  | { kind: "kapt"; kaptCode: string }
  | { kind: "name"; region: string; name: string };

/** id → kapt 또는 name 해석 (실패 시 null) */
export function parseComplexId(id: string): ParsedComplexId | null {
  const raw = id.trim();
  if (!raw) return null;
  if (raw.startsWith(KAPT_COMPLEX_ID_PREFIX)) {
    const kaptCode = raw.slice(KAPT_COMPLEX_ID_PREFIX.length).trim().toUpperCase();
    return kaptCode ? { kind: "kapt", kaptCode } : null;
  }
  const dec = decodeComplexId(raw);
  return dec ? { kind: "name", region: dec.region, name: dec.name } : null;
}

/** id → { region, name } (실패 시 null). kapt id 는 null — getComplexById 가 분기한다. */
export function decodeComplexId(id: string): { region: string; name: string } | null {
  if (id.startsWith(KAPT_COMPLEX_ID_PREFIX)) return null;
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
    building_count: null,
    parking_count: null,
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
  /** 세대수 — 국토부 상세(V4)에서 온 값일 때만. 아래 households 주석 참조. */
  households: number | null;
  /** 동 수 — 세대수와 같은 출처 조건 */
  buildingCount: number | null;
  /** 총 주차대수 — 같은 출처 조건 */
  parkingCount: number | null;
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
  const { data, error } = await q;
  /* 대장 마스터는 부가정보(좌표·난방·도로명)라 없어도 허브는 실거래만으로 그린다.
     그래도 "못 읽음"과 "매칭 없음"은 다른 사실이라 실패는 던진다 — 조용히 null 이
     되면 지도 마커가 사라진 이유가 무매칭인지 장애인지 구분할 방법이 없다.
     부르는 쪽(getComplexById)이 받아서 로그로 남기고 실거래만으로 계속한다. */
  if (error) throw dbError("apartment_complexes", error);
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
  /* 세대수 — **출처를 가려서** 쓴다.
   *
   * 예전 주석은 "householdCount 는 상당수 과대(중앙값 4천대)라 사용하지 않는다"
   * 였고, 그래서 지도 상세의 세대수가 늘 "—" 였다. 2026-07-27 실제로 재보니
   * 그 진단은 **출처 하나에만** 맞았다:
   *   · 대장 마스터 ETL 이 채운 값 (18,270행): 중앙값 4,640 · 최대 147,000 → 세대수가 아니다
   *   · 상세 API V4 가 채운 값 (3,401행):     중앙값   225 · 최대  12,330 → 맞는 값
   * V4 표본 검증: 올림픽파크포레온 12,032세대·85동, 디에이치퍼스티어아이파크
   * 6,702세대, 평촌어바인퍼스트 3,850세대 — 모두 실제와 일치한다.
   *
   * 즉 값이 나쁜 게 아니라 **두 출처가 같은 키에 섞여 있었다**. 그래서 전부
   * 버리는 대신 detailFetchedAt(=V4 상세를 실제로 받아온 표식)이 있을 때만 쓴다.
   * 표식이 없으면 null 을 돌려주고 화면은 "—" 로 남는다 — 틀린 숫자를 보여 주는
   * 것보다 모른다고 두는 편이 낫다.
   */
  const fromV4Detail = typeof m.detailFetchedAt === "string" && m.detailFetchedAt.length > 0;
  const posInt = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };

  return {
    kaptCode: typeof m.kaptCode === "string" ? m.kaptCode : null,
    buildYear,
    heating: typeof m.heating === "string" ? m.heating : null,
    roadAddress: typeof m.roadAddress === "string" ? m.roadAddress : null,
    builder: typeof m.builder === "string" ? m.builder : null,
    lat: hasCoord ? lat : null,
    lng: hasCoord ? lng : null,
    households: fromV4Detail ? posInt(m.householdCount) : null,
    buildingCount: fromV4Detail ? posInt(m.buildingCount) : null,
    parkingCount: fromV4Detail ? posInt(m.parkingCount) : null,
  };
}

export async function getComplexById(id: string): Promise<ComplexRow | null> {
  const parsed = parseComplexId(id);
  if (!parsed) return null;
  if (parsed.kind === "kapt") {
    return getComplexByKaptCode(parsed.kaptCode);
  }
  const dec = parsed;
  const sb = getServiceSupabase();
  if (!sb) return null;
  // 이 단지의 매매 실거래가 1건이라도 있으면 실재하는 단지로 간주 (대표 정보 도출)
  const { data, error } = await sb
    .from("market_transactions")
    .select("address, build_year")
    .eq("complex_name", dec.name)
    .eq("region_name", dec.region)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .order("build_year", { ascending: false, nullsFirst: false })
    .limit(1);
  /* 여기서 null 을 돌려주면 허브 페이지가 notFound() 를 부른다. 그 페이지는
     revalidate = 120 인 ISR 이라 "그런 단지는 없습니다" 404 가 2분간 얼어붙는다.
     실재하는 단지가 장애 몇 초 때문에 검색엔진에 없는 단지로 보이면 안 된다. */
  if (error) throw dbError(`market_transactions (단지 ${dec.name})`, error);
  const row = (data as { address: string | null; build_year: number | null }[] | null)?.[0];
  if (!row) return null;

  const base = toComplexRow(dec.region, dec.name, row);
  // D7 — 대장 마스터(apartment_complexes) 매칭 enrich (세대수·준공·난방·도로명·kapt).
  // 실패해도 허브는 실거래만으로 그린다. 다만 조용히 넘기지 않고 로그는 남긴다.
  const apt = await enrichFromApartmentComplex(dec.region, dec.name).catch((e) => {
    logger.warn("[complex] 대장 마스터 enrich 실패 — 실거래만으로 계속", e);
    return null;
  });
  if (apt) {
    base.kapt_code = apt.kaptCode ?? base.kapt_code;
    /* kapt 가 있으면 URL id 도 kapt 형태로 노출 — 동명 충돌 시 링크가 갈라진다.
       기존 name-id 북마크는 위 decode 경로로 계속 동작한다. */
    if (apt.kaptCode) base.id = encodeKaptComplexId(apt.kaptCode);
    base.build_year = base.build_year ?? apt.buildYear; // 실거래 build_year 우선
    base.heating = apt.heating ?? base.heating;
    base.road_address = apt.roadAddress ?? base.road_address;
    base.builder_name = apt.builder ?? base.builder_name;
    if (apt.lat != null && apt.lng != null) {
      base.lat = apt.lat;
      base.lng = apt.lng;
    }
    // 세대수 — V4 상세에서 온 값만 온다(enrichFromApartmentComplex 주석 참조).
    base.households = apt.households ?? base.households;
    base.building_count = apt.buildingCount ?? base.building_count;
    base.parking_count = apt.parkingCount ?? base.parking_count;
    /* 세대당 주차대수는 여기서 계산한다. 두 값 다 같은 상세 응답에서 왔고,
       세대수가 0이면 나눗셈이 무한대가 되므로 households > 0 일 때만. */
    if (apt.parkingCount != null && apt.households != null && apt.households > 0) {
      base.parking_per_hh = Math.round((apt.parkingCount / apt.households) * 100) / 100;
    }
  }
  return base;
}

/**
 * K-apt 코드로 단지 허브 로드.
 * apartment_complexes.metadata.kaptCode 로 찾고, 이름·지역이 있으면 실거래로 보강.
 */
export async function getComplexByKaptCode(kaptCode: string): Promise<ComplexRow | null> {
  const code = kaptCode.trim().toUpperCase();
  if (!code) return null;
  const sb = getServiceSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("apartment_complexes")
    .select("name, address, metadata")
    .eq("source_key", APT_MASTER_SOURCE_KEY)
    .filter("metadata->>kaptCode", "eq", code)
    .limit(5);
  if (error) throw dbError(`apartment_complexes (kapt ${code})`, error);
  const rows =
    (data as
      | { name: string; address: string | null; metadata: Record<string, unknown> | null }[]
      | null) ?? [];
  if (rows.length === 0) return null;

  const row = rows[0];
  const m = row.metadata ?? {};
  const regionGuess =
    typeof m.regionName === "string" && m.regionName.trim()
      ? m.regionName.trim()
      : (row.address ?? "").split(/\s+/).slice(0, 2).join(" ") || "전국";
  const name = row.name?.trim() || code;

  /* 실거래가 있으면 name-id 경로로 풍부한 허브를 만들고 id 만 kapt 로 고정 */
  try {
    const byName = await getComplexById(encodeComplexId(regionGuess, name));
    if (byName) {
      byName.id = encodeKaptComplexId(code);
      byName.kapt_code = code;
      return byName;
    }
  } catch (e) {
    logger.warn("[complex] kapt→실거래 보강 실패 — 마스터만으로 계속", e);
  }

  const base = toComplexRow(regionGuess, name, {
    address: row.address,
    build_year: typeof m.approvalDate === "string" ? Number(m.approvalDate.slice(0, 4)) || null : null,
  });
  base.id = encodeKaptComplexId(code);
  base.kapt_code = code;
  if (typeof m.lat === "number" && typeof m.lng === "number") {
    base.lat = m.lat;
    base.lng = m.lng;
  }
  return base;
}

/* ------------------------------------------------------------------
   region_name 해석표 — 앞% ILIKE 를 등치(.in)로 바꾸기 위한 것.

   측정(2026-07-27, 654,815행):
     region_name ILIKE '%노원구%'  →  2,958 ms (부분 인덱스 스캔 + 필터)
     region_name ILIKE '%울릉군%'  → 18,047 ms (전체 병렬 seq scan)
     region_name IN ('경북 울릉군') →     8.3 ms (mt_trade_complex_geo_idx)

   service_role 의 statement timeout 은 8초라, 거래가 적은 지역일수록 확실히
   잘린다 — /complex/[id] "인근 단지" 가 계속 실패로 접히던 원인이다.
   실제 존재하는 region_name 은 218개뿐이므로 한 번 받아 두고 JS 에서 고른다.
   판정은 `.includes()` — ILIKE '%x%' 와 의미가 같아 결과가 달라지지 않는다.
   ------------------------------------------------------------------ */
const REGION_NAMES_TTL_MS = 6 * 60 * 60_000;
let regionNamesCache: { at: number; names: string[] } | null = null;

/**
 * market_region_names() RPC 결과. 실패하면 **null** 을 돌려준다 —
 * 빈 배열로 답하면 "그런 지역은 없다"가 되어 부르는 쪽이 조용히 0건을 그린다.
 */
async function loadRegionNames(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
): Promise<string[] | null> {
  const now = Date.now();
  if (regionNamesCache && now - regionNamesCache.at < REGION_NAMES_TTL_MS) {
    return regionNamesCache.names;
  }
  const { data, error } = await sb.rpc("market_region_names");
  if (error) {
    logger.warn("[complex] market_region_names 조회 실패 — ILIKE 로 물러섭니다.", error);
    return null;
  }
  const names = ((data as { region_name: string }[] | null) ?? [])
    .map((r) => String(r.region_name ?? ""))
    .filter(Boolean);
  if (names.length === 0) return null; // 218개가 정상 — 0개면 못 받은 것으로 본다
  regionNamesCache = { at: now, names };
  return names;
}

/** `.in()` 이 URL 길이를 위협하지 않는 상한. 실제 구 이름은 1~3개만 맞는다. */
const REGION_IN_MAX = 60;

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
  if (dist) {
    const names = await loadRegionNames(sb);
    if (names === null) {
      // 해석표를 못 받았을 때만 예전 방식으로 물러선다(느리지만 결과는 같다).
      q = q.ilike("region_name", `%${dist}%`);
    } else {
      const needle = dist.toLowerCase();
      const hit = names.filter((n) => n.toLowerCase().includes(needle));
      /* hit 가 비면 그건 실패가 아니라 사실이다 — 해석표에 없는 지역명은
         ILIKE 로 훑어도 0건이다. 그러니 굳이 18초를 태우지 않는다. */
      if (hit.length === 0) return [];
      if (hit.length > REGION_IN_MAX) q = q.ilike("region_name", `%${dist}%`);
      else q = q.in("region_name", hit);
    }
  }

  // 넉넉히 가져와 (region_name, complex_name) 기준 중복 제거
  // (ilike 는 complex_name trigram GIN 인덱스를 탄다)
  const { data, error } = await q.order("contract_ym", { ascending: false }).limit(800);
  /* 빈 배열은 "그런 단지는 없다"는 뜻이다. 못 읽었을 때 그렇게 답하면 사용자는
     검색어를 의심하며 같은 검색을 반복하고, 링크 해석(complex-link)은 실재하는
     단지의 허브 링크를 숨긴다. 부르는 쪽이 "지금 검색이 안 된다"를 말하게 한다. */
  if (error) throw dbError("market_transactions (단지 검색)", error);
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
  const { data, error } = await sb
    .from("market_transactions")
    .select("complex_name, region_name, address, build_year")
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .not("complex_name", "is", null)
    .or(ors)
    .order("contract_ym", { ascending: false })
    .limit(400);
  /* 이 함수는 "결과가 하나도 없을 때" 부르는 대안 제안이다. 여기서 또 빈 배열을
     돌려주면 화면은 "제안할 만한 단지도 없다"까지 단정하게 된다. */
  if (error) throw dbError("market_transactions (대안 제안)", error);

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

  const { data: reg, error: regError } = await sb
    .from("market_region_price")
    .select("per_m2_sale, sale_change, jeonse_ratio, period")
    .eq("region_name", district)
    .order("period", { ascending: false })
    .limit(1)
    .maybeSingle();
  /* maybeSingle 은 0행이면 {data:null, error:null} 이다 — 그래서 error 만 실패다.
     실패를 null 로 삼키면 "이 동네 대비" 섹션이 통째로 사라지고, 사용자는 이 구에
     기준 시세가 없다고 이해한다. 없는 것과 못 읽은 것은 다른 사실이다. */
  if (regError) throw dbError("market_region_price", regError);
  const districtPerM2 = reg?.per_m2_sale != null ? Number(reg.per_m2_sale) : 0;
  if (!Number.isFinite(districtPerM2) || districtPerM2 <= 0) return null;

  const { data: tx, error: txError } = await sb
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
  if (txError) throw dbError("market_transactions (지역 대비)", txError);
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
  const { data, error } = await sb
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
  /* 빈 배열이면 "면적대별 시세" 섹션이 통째로 안 그려진다 — 실거래가 없는 단지라는
     뜻이다. 못 읽은 것을 그렇게 그리면 안 된다. */
  if (error) throw dbError("market_transactions (면적대별)", error);
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
  const { data, error } = await sb
    .from("market_transactions")
    .select("contract_ym, deal_amount_krw")
    .eq("complex_name", dec.name)
    .eq("region_name", dec.region)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .gt("deal_amount_krw", 0);
  /* 이 값은 시세 화면의 근거다. 빈 배열은 "신고된 거래가 없다"는 강한 주장이고,
     price-analysis 는 그때 실거래 대신 추정 경로로 넘어간다 — 못 읽었을 뿐인데
     추정치가 실거래인 척 자리를 채우면 안 된다. */
  if (error) throw dbError(`market_transactions (실거래 이력 ${dec.name})`, error);

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
  const { data, error } = await sb
    .from("posts")
    .select("id,title,created_at,district,city,like_count,comment_count,view_count")
    .eq("complex_id", complexId)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);
  /* "아직 이 단지 이야기가 없어요"와 "지금 못 불러왔어요"는 다른 문장이다.
     앞의 문장은 글을 쓴 사람에게 자기 글이 사라진 것처럼 보인다. */
  if (error) throw dbError("posts (단지 이야기)", error);
  return data ?? [];
}
