/**
 * 국토교통부 건축HUB API 클라이언트
 * https://www.data.go.kr
 *
 * 공통 인증키: MOLIT_SERVICE_KEY (일반 인증키, 인코딩)
 * Base URL: https://apis.data.go.kr/1613000
 */
import { encodingKeyForUrl } from "@/lib/public-data/data-go-kr-keys";
import { resolveSigunguCd } from "@/lib/national-data/region-codes";

const BUILDHUB_BASE = "https://apis.data.go.kr/1613000";

function serviceKey(): string | null {
  return encodingKeyForUrl();
}

/** XML <item> 파싱 (minified XML 포함 처리) */
function parseXmlItems(text: string): Record<string, string>[] {
  return [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const row: Record<string, string> = {};
    for (const tag of m[1].matchAll(/<([^/>]+)>([^<]*)<\//g)) {
      row[tag[1].trim()] = tag[2].trim();
    }
    return row;
  });
}

async function fetchBuildhubXml(
  service: string,
  operation: string,
  params: Record<string, string | number>,
  numOfRows = 30,
): Promise<{ items: Record<string, string>[]; totalCount: number; mode: "live" | "mock" }> {
  const key = serviceKey();
  if (!key) return { items: [], totalCount: 0, mode: "mock" };

  const url = new URL(`${BUILDHUB_BASE}/${service}/${operation}`);
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

// ── 건축물대장 ────────────────────────────────────────────────────────

export interface BuildingBasicInfo {
  sigunguCd: string;
  bjdongCd: string;
  bldNm?: string;          // 건물명
  platPlc?: string;        // 대지위치 (도로명 이전 주소)
  newPlatPlc?: string;     // 도로명 주소
  mainPurpsCdNm?: string;  // 주 용도
  etcPurps?: string;       // 기타 용도
  totArea?: string;        // 연면적(㎡)
  archArea?: string;       // 건축면적(㎡)
  bcRat?: string;          // 건폐율(%)
  vlRat?: string;          // 용적률(%)
  hhldCnt?: string;        // 세대수
  fmlyCnt?: string;        // 가구수
  grndFlrCnt?: string;     // 지상층수
  ugrndFlrCnt?: string;    // 지하층수
  rideUseElvtCnt?: string; // 승용 승강기 수
  useAprDay?: string;      // 사용승인일(YYYYMMDD)
  crtnDay?: string;        // 생성일
  raw: Record<string, string>;
}

function normalizeBuildingBasic(r: Record<string, string>): BuildingBasicInfo {
  return {
    sigunguCd: r.sigunguCd ?? "",
    bjdongCd: r.bjdongCd ?? "",
    bldNm: r.bldNm || undefined,
    platPlc: r.platPlc || undefined,
    newPlatPlc: r.newPlatPlc || undefined,
    mainPurpsCdNm: r.mainPurpsCdNm || undefined,
    etcPurps: r.etcPurps || undefined,
    totArea: r.totArea || undefined,
    archArea: r.archArea || undefined,
    bcRat: r.bcRat || undefined,
    vlRat: r.vlRat || undefined,
    hhldCnt: r.hhldCnt || undefined,
    fmlyCnt: r.fmlyCnt || undefined,
    grndFlrCnt: r.grndFlrCnt || undefined,
    ugrndFlrCnt: r.ugrndFlrCnt || undefined,
    rideUseElvtCnt: r.rideUseElvtCnt || undefined,
    useAprDay: r.useAprDay || undefined,
    crtnDay: r.crtnDay || undefined,
    raw: r,
  };
}

/**
 * 건축물대장 표제부 조회
 * @param sigunguCd 5자리 시군구코드 (또는 지역명 — 자동 변환)
 * @param bjdongCd  5자리 법정동코드
 */
export async function fetchBuildingTitleInfo(params: {
  sigunguCd: string;
  bjdongCd: string;
  platGbCd?: string; // 대지구분 0: 대지 1: 산 2: 블록
  bun?: string;      // 번
  ji?: string;       // 지
  numOfRows?: number;
}): Promise<{ buildings: BuildingBasicInfo[]; totalCount: number; mode: "live" | "mock" }> {
  const sigunguCd = params.sigunguCd.length !== 5
    ? resolveSigunguCd(params.sigunguCd)
    : params.sigunguCd;

  const { items, totalCount, mode } = await fetchBuildhubXml(
    "BldRgstHubService",
    "getBrTitleInfo",
    {
      sigunguCd,
      bjdongCd: params.bjdongCd,
      ...(params.platGbCd ? { platGbCd: params.platGbCd } : {}),
      ...(params.bun ? { bun: params.bun } : {}),
      ...(params.ji ? { ji: params.ji } : {}),
    },
    params.numOfRows ?? 30,
  );

  return { buildings: items.map(normalizeBuildingBasic), totalCount, mode };
}

/**
 * 건축물대장 기본개요 조회 (건물명+주소+연면적 간략 조회)
 */
export async function fetchBuildingBasisInfo(params: {
  sigunguCd: string;
  bjdongCd: string;
  numOfRows?: number;
}): Promise<{ buildings: BuildingBasicInfo[]; totalCount: number; mode: "live" | "mock" }> {
  const sigunguCd = params.sigunguCd.length !== 5
    ? resolveSigunguCd(params.sigunguCd)
    : params.sigunguCd;

  const { items, totalCount, mode } = await fetchBuildhubXml(
    "BldRgstHubService",
    "getBrBasisOulnInfo",
    { sigunguCd, bjdongCd: params.bjdongCd },
    params.numOfRows ?? 20,
  );

  return { buildings: items.map(normalizeBuildingBasic), totalCount, mode };
}

// ── 건축인허가 ────────────────────────────────────────────────────────

export interface ArchPermit {
  sigunguCd: string;
  bjdongCd: string;
  archGbCd?: string;       // 건축구분코드
  archGbCdNm?: string;     // 건축구분명
  bldNm?: string;          // 건물명
  platPlc?: string;        // 대지위치
  mainPurpsCdNm?: string;  // 주 용도
  totArea?: string;        // 연면적
  pmsDay?: string;         // 허가일(YYYYMMDD)
  stcnsDay?: string;       // 착공일
  useAprDay?: string;      // 사용승인일
  raw: Record<string, string>;
}

function normalizeArchPermit(r: Record<string, string>): ArchPermit {
  return {
    sigunguCd: r.sigunguCd ?? "",
    bjdongCd: r.bjdongCd ?? "",
    archGbCd: r.archGbCd || undefined,
    archGbCdNm: r.archGbCdNm || undefined,
    bldNm: r.bldNm || undefined,
    platPlc: r.platPlc || undefined,
    mainPurpsCdNm: r.mainPurpsCdNm || undefined,
    totArea: r.totArea || undefined,
    pmsDay: r.pmsDay || undefined,
    stcnsDay: r.stcnsDay || undefined,
    useAprDay: r.useAprDay || undefined,
    raw: r,
  };
}

/**
 * 건축인허가 기본개요 조회
 */
export async function fetchArchPermits(params: {
  sigunguCd: string;
  bjdongCd?: string;
  startDate?: string; // YYYYMMDD
  endDate?: string;
  numOfRows?: number;
}): Promise<{ permits: ArchPermit[]; totalCount: number; mode: "live" | "mock" }> {
  const sigunguCd = params.sigunguCd.length !== 5
    ? resolveSigunguCd(params.sigunguCd)
    : params.sigunguCd;

  const query: Record<string, string> = { sigunguCd };
  if (params.bjdongCd) query.bjdongCd = params.bjdongCd;
  if (params.startDate) query.startDate = params.startDate;
  if (params.endDate) query.endDate = params.endDate;

  const { items, totalCount, mode } = await fetchBuildhubXml(
    "ArchPmsService",
    "getApBasisOulnInfo",
    query,
    params.numOfRows ?? 20,
  );

  return { permits: items.map(normalizeArchPermit), totalCount, mode };
}

/**
 * 주택인허가 기본개요 조회
 */
export async function fetchHousingPermits(params: {
  sigunguCd: string;
  bjdongCd?: string;
  startDate?: string;
  endDate?: string;
  numOfRows?: number;
}): Promise<{ permits: ArchPermit[]; totalCount: number; mode: "live" | "mock" }> {
  const sigunguCd = params.sigunguCd.length !== 5
    ? resolveSigunguCd(params.sigunguCd)
    : params.sigunguCd;

  const query: Record<string, string> = { sigunguCd };
  if (params.bjdongCd) query.bjdongCd = params.bjdongCd;
  if (params.startDate) query.startDate = params.startDate;
  if (params.endDate) query.endDate = params.endDate;

  const { items, totalCount, mode } = await fetchBuildhubXml(
    "HousPmsService",
    "getHousBasisOulnInfo",
    query,
    params.numOfRows ?? 20,
  );

  return { permits: items.map(normalizeArchPermit), totalCount, mode };
}
