/**
 * 국토교통부 공동주택 정보 API 클라이언트
 * - 공동주택 단지 목록제공 서비스  (AptListService2)
 * - 공동주택 기본 정보제공 서비스  (AptBasisInfoService2)
 *
 * 공통 인증키: MOLIT_SERVICE_KEY
 */
import { encodingKeyForUrl } from "@/lib/public-data/data-go-kr-keys";
import { resolveSigunguCd } from "@/lib/national-data/region-codes";

const APT_BASE = "https://apis.data.go.kr/1613000";

function serviceKey(): string | null {
  return encodingKeyForUrl();
}

function parseXmlItems(text: string): Record<string, string>[] {
  return [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const row: Record<string, string> = {};
    for (const tag of m[1].matchAll(/<([^/>]+)>([^<]*)<\//g)) {
      row[tag[1].trim()] = tag[2].trim();
    }
    return row;
  });
}

async function fetchAptXml(
  service: string,
  operation: string,
  params: Record<string, string | number>,
  numOfRows = 30,
): Promise<{ items: Record<string, string>[]; totalCount: number; mode: "live" | "mock" }> {
  const key = serviceKey();
  if (!key) return { items: [], totalCount: 0, mode: "mock" };

  const url = new URL(`${APT_BASE}/${service}/${operation}`);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", String(numOfRows));
  for (const [k, v] of Object.entries(params)) {
    if (v !== "" && v !== undefined) url.searchParams.set(k, String(v));
  }

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    if (!res.ok) return { items: [], totalCount: 0, mode: "mock" };
    const text = await res.text();
    const items = parseXmlItems(text);
    const totalMatch = text.match(/<totalCount>(\d+)<\/totalCount>/);
    const totalCount = totalMatch ? Number(totalMatch[1]) : items.length;
    if (items.length > 0) return { items, totalCount, mode: "live" };
  } catch {
    // fall through
  }
  return { items: [], totalCount: 0, mode: "mock" };
}

// ── 단지 목록 ─────────────────────────────────────────────────────────

export interface AptComplex {
  kaptCode: string;    // 단지코드 (기본정보 조회에 사용)
  kaptName: string;    // 단지명
  sigunguCd: string;
  bjdongCd?: string;
  as1?: string;        // 시도명
  as2?: string;        // 시군구명
  as3?: string;        // 읍면동명
  as4?: string;        // 단지 주소(상세)
  kaptDongCnt?: string;  // 동 수
  hhldCnt?: string;      // 세대 수
  kaptUsedate?: string;  // 사용승인일 (YYYY-MM-DD)
  raw: Record<string, string>;
}

function normalizeComplex(r: Record<string, string>): AptComplex {
  return {
    kaptCode: r.kaptCode ?? "",
    kaptName: r.kaptName ?? "",
    sigunguCd: r.sigunguCd ?? "",
    bjdongCd: r.bjdongCd || undefined,
    as1: r.as1 || undefined,
    as2: r.as2 || undefined,
    as3: r.as3 || undefined,
    as4: r.as4 || undefined,
    kaptDongCnt: r.kaptDongCnt || undefined,
    hhldCnt: r.hhldCnt || undefined,
    kaptUsedate: r.kaptUsedate || undefined,
    raw: r,
  };
}

/**
 * 시군구별 공동주택 단지 목록 조회.
 * @param sigunguCd 5자리 코드 또는 지역명 (자동 변환)
 */
export async function fetchAptComplexList(params: {
  sigunguCd: string;
  bjdongCd?: string;
  pageNo?: number;
  numOfRows?: number;
}): Promise<{ complexes: AptComplex[]; totalCount: number; mode: "live" | "mock" }> {
  const sigunguCd = params.sigunguCd.length !== 5
    ? resolveSigunguCd(params.sigunguCd)
    : params.sigunguCd;

  const query: Record<string, string | number> = { sigunguCd };
  if (params.bjdongCd) query.bjdongCd = params.bjdongCd;
  if (params.pageNo && params.pageNo > 1) query.pageNo = params.pageNo;

  const { items, totalCount, mode } = await fetchAptXml(
    "AptListService2",
    "getAptList",
    query,
    params.numOfRows ?? 30,
  );

  return { complexes: items.map(normalizeComplex), totalCount, mode };
}

// ── 단지 기본정보 ─────────────────────────────────────────────────────

export interface AptComplexDetail {
  kaptCode: string;
  kaptName: string;
  kaptAddr?: string;       // 주소
  doroJuso?: string;       // 도로명 주소
  kaptDongCnt?: string;    // 동 수
  hhldCnt?: string;        // 세대 수
  kaptUsedate?: string;    // 사용승인일
  kaptdaCnt?: string;      // 건물 수
  kaptArea?: string;       // 대지면적(㎡)
  kaptTarea?: string;      // 연면적(㎡)
  kaptMgrStle?: string;    // 관리 방식
  heatSplyMthdCd?: string; // 난방 방식
  elevCnt?: string;        // 승강기 수
  parkingLotCnt?: string;  // 주차 가능 대수
  kaptdaCode?: string;     // 건설사 코드
  kaptdaNm?: string;       // 건설사명
  lat?: string;
  lng?: string;
  raw: Record<string, string>;
}

function normalizeComplexDetail(r: Record<string, string>): AptComplexDetail {
  return {
    kaptCode: r.kaptCode ?? "",
    kaptName: r.kaptName ?? "",
    kaptAddr: r.kaptAddr || undefined,
    doroJuso: r.doroJuso || undefined,
    kaptDongCnt: r.kaptDongCnt || undefined,
    hhldCnt: r.hhldCnt || undefined,
    kaptUsedate: r.kaptUsedate || undefined,
    kaptdaCnt: r.kaptdaCnt || undefined,
    kaptArea: r.kaptArea || undefined,
    kaptTarea: r.kaptTarea || undefined,
    kaptMgrStle: r.kaptMgrStle || undefined,
    heatSplyMthdCd: r.heatSplyMthdCd || undefined,
    elevCnt: r.elevCnt || undefined,
    parkingLotCnt: r.parkingLotCnt || undefined,
    kaptdaCode: r.kaptdaCode || undefined,
    kaptdaNm: r.kaptdaNm || undefined,
    lat: r.lat || r.latitude || undefined,
    lng: r.lng || r.longitude || undefined,
    raw: r,
  };
}

/**
 * 공동주택 단지 기본정보 조회.
 * @param kaptCode 단지코드 (fetchAptComplexList 결과의 kaptCode)
 */
export async function fetchAptComplexDetail(
  kaptCode: string,
): Promise<{ detail: AptComplexDetail | null; mode: "live" | "mock" }> {
  const { items, mode } = await fetchAptXml(
    "AptBasisInfoService2",
    "getAptsaleInfo",
    { kaptCode },
    1,
  );
  if (items.length === 0) return { detail: null, mode };
  return { detail: normalizeComplexDetail(items[0]), mode };
}

/**
 * 단지명 또는 주소로 단지 검색 (단지목록 + 키워드 필터).
 */
export async function searchAptComplex(params: {
  sigunguCd: string;
  keyword?: string;
  numOfRows?: number;
}): Promise<{ complexes: AptComplex[]; mode: "live" | "mock" }> {
  const { complexes, mode } = await fetchAptComplexList({
    sigunguCd: params.sigunguCd,
    numOfRows: params.numOfRows ?? 50,
  });
  if (!params.keyword?.trim()) return { complexes, mode };

  const q = params.keyword.trim().toLowerCase();
  return {
    complexes: complexes.filter(
      (c) =>
        c.kaptName.toLowerCase().includes(q) ||
        (c.as3 && c.as3.toLowerCase().includes(q)) ||
        (c.as4 && c.as4.toLowerCase().includes(q)),
    ),
    mode,
  };
}
