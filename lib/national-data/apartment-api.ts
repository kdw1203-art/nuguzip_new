/**
 * 국토교통부 공동주택 정보 API 클라이언트
 * - 공동주택 단지 목록제공 서비스  (AptListService3)   ← 2024 개편: JSON, sigunguCode
 * - 공동주택 기본 정보제공 서비스  (AptBasisInfoServiceV4) ← 개편: JSON, getAphusBassInfoV4
 *
 * 2026-07 확인: 구버전(AptListService2/AptBasisInfoService2, XML)은 폐기됐다.
 * 폐기 엔드포인트는 빈 응답을 돌려줘 "상세 없음"으로 조용히 실패했고(실측 실패=200/200),
 * 그래서 좌표·건설사·세대수가 한 건도 안 채워졌다. 개편 엔드포인트는 응답이 JSON 이며
 * 필드명도 바뀌었다(건설사=kaptBcompany, 세대/호=hoCnt, 난방=codeHeatNm, 관리=codeMgrNm).
 *
 * 공통 인증키: MOLIT_SERVICE_KEY
 */
import { encodingKeyForUrl } from "@/lib/public-data/data-go-kr-keys";
import { resolveSigunguCd } from "@/lib/national-data/region-codes";

const APT_BASE = "https://apis.data.go.kr/1613000";

function serviceKey(): string | null {
  return encodingKeyForUrl();
}

/** data.go.kr JSON 응답에서 item(s)·totalCount 를 뽑고, 인증·쿼터 오류는 던진다. */
async function fetchAptJson(
  service: string,
  operation: string,
  params: Record<string, string | number>,
  numOfRows = 30,
): Promise<{ items: Record<string, unknown>[]; totalCount: number; mode: "live" | "mock" }> {
  const key = serviceKey();
  if (!key) return { items: [], totalCount: 0, mode: "mock" };

  const url = new URL(`${APT_BASE}/${service}/${operation}`);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("_type", "json"); // 개편 API 기본이 JSON 이지만 명시
  for (const [k, v] of Object.entries(params)) {
    if (v !== "" && v !== undefined) url.searchParams.set(k, String(v));
  }

  let text: string;
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    if (!res.ok) return { items: [], totalCount: 0, mode: "mock" };
    text = await res.text();
  } catch {
    // 네트워크 오류는 조용히 mock 폴백(읽기 UI 라우트 회귀 방지).
    return { items: [], totalCount: 0, mode: "mock" };
  }

  // 인증·쿼터 오류는 200 으로 오면서 XML 봉투(<returnAuthMsg>…)를 담는 경우가 있다.
  // JSON 파싱 실패 시 그 봉투를 읽어 실제 사유를 던진다(크론 로그·아침 브리핑에 노출).
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const authMsg =
      text.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>/)?.[1] ??
      text.match(/<errMsg>([^<]+)<\/errMsg>/)?.[1];
    const reasonCode =
      text.match(/<returnReasonCode>([^<]+)<\/returnReasonCode>/)?.[1] ??
      text.match(/<resultCode>([^<]+)<\/resultCode>/)?.[1];
    if (authMsg || (reasonCode && !["00", "0", "000"].includes(reasonCode))) {
      throw new Error(
        `data.go.kr ${service} 거부 — ${[reasonCode, authMsg].filter(Boolean).join(" ")}`.trim(),
      );
    }
    return { items: [], totalCount: 0, mode: "mock" };
  }

  const resp = (json as { response?: Record<string, unknown> }).response ?? {};
  const header = (resp.header ?? {}) as { resultCode?: string; resultMsg?: string };
  if (header.resultCode && !["00", "000", "0"].includes(header.resultCode)) {
    throw new Error(
      `data.go.kr ${service} 거부 — ${header.resultCode} ${header.resultMsg ?? ""}`.trim(),
    );
  }
  const body = (resp.body ?? {}) as {
    item?: unknown;
    items?: unknown;
    totalCount?: number;
  };
  // 목록: body.items = 배열. 상세: body.item = 객체. 일부는 body.items.item 중첩.
  const nested = (body.items as { item?: unknown } | undefined)?.item;
  const node = body.item ?? nested ?? body.items ?? [];
  const items = (Array.isArray(node) ? node : node ? [node] : []) as Record<string, unknown>[];
  const totalCount = typeof body.totalCount === "number" ? body.totalCount : items.length;
  return { items, totalCount, mode: items.length > 0 ? "live" : "mock" };
}

/** JSON 값(문자/숫자 혼재)을 문자열로 정규화 */
function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}
function toStrRow(r: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) out[k] = s(v);
  return out;
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
    // V3 목록은 sigunguCd 를 직접 주지 않는다 — bjdCode(법정동코드) 앞 5자리로 대체.
    sigunguCd: r.sigunguCd || (r.bjdCode ? r.bjdCode.slice(0, 5) : ""),
    bjdongCd: r.bjdCode || r.bjdongCd || undefined,
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

  // V3: 파라미터는 sigunguCode(5자리). bjdongCd 는 법정동 단위 조회 시 사용.
  const query: Record<string, string | number> = { sigunguCode: sigunguCd };
  if (params.bjdongCd) query.bjdongCode = params.bjdongCd;
  if (params.pageNo && params.pageNo > 1) query.pageNo = params.pageNo;

  const { items, totalCount, mode } = await fetchAptJson(
    "AptListService3",
    "getSigunguAptList3",
    query,
    params.numOfRows ?? 100,
  );

  return { complexes: items.map((r) => normalizeComplex(toStrRow(r))), totalCount, mode };
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

/**
 * V4 기본정보(getAphusBassInfoV4) 필드명 매핑.
 * 건설사=kaptBcompany(시공)/kaptAcompany(시행), 세대·호=hoCnt/kaptdaCnt,
 * 난방=codeHeatNm, 관리=codeMgrNm, 도로명=doroJuso, 지번=kaptAddr, 승인=kaptUsedate.
 * 좌표는 이 API 에 없다(도로명주소를 지오코딩해 채운다).
 */
function normalizeComplexDetail(r: Record<string, string>): AptComplexDetail {
  return {
    kaptCode: r.kaptCode ?? "",
    kaptName: r.kaptName ?? "",
    kaptAddr: r.kaptAddr || undefined,
    doroJuso: r.doroJuso || undefined,
    kaptDongCnt: r.kaptDongCnt || undefined,
    hhldCnt: r.hoCnt || r.kaptdaCnt || r.hhldCnt || undefined,
    kaptUsedate: r.kaptUsedate || undefined,
    kaptdaCnt: r.kaptdaCnt || undefined,
    kaptArea: r.kaptTarea || r.kaptArea || undefined,
    kaptTarea: r.kaptTarea || undefined,
    kaptMgrStle: r.codeMgrNm || r.kaptMgrStle || undefined,
    heatSplyMthdCd: r.codeHeatNm || r.heatSplyMthdCd || undefined,
    elevCnt: r.kaptdEcnt || r.elevCnt || undefined,
    parkingLotCnt: r.parkingLotCnt || undefined, // 기본정보엔 없음(상세정보 getAphusDtlInfoV4)
    kaptdaCode: r.kaptBcompany ? undefined : r.kaptdaCode || undefined,
    kaptdaNm: r.kaptBcompany || r.kaptdaNm || undefined,
    lat: r.lat || r.latitude || undefined,
    lng: r.lng || r.longitude || undefined,
    raw: r,
  };
}

/**
 * V4 상세정보(getAphusDtlInfoV4) — 주차·승강기·편의시설을 기본정보 위에 덧댄다.
 * 주차 = 지상(kaptdPcnt) + 지하(kaptdPcntu).
 */
function mergeDetailInfo(base: AptComplexDetail, r: Record<string, string>): AptComplexDetail {
  const ground = Number(r.kaptdPcnt) || 0;
  const under = Number(r.kaptdPcntu) || 0;
  const parking = ground + under;
  return {
    ...base,
    parkingLotCnt: parking > 0 ? String(parking) : base.parkingLotCnt,
    elevCnt: r.kaptdEcnt || base.elevCnt,
    raw: { ...base.raw, ...r },
  };
}

/**
 * 공동주택 단지 기본정보 조회 (V4). 기본정보 + 상세정보(주차·편의시설)를 합쳐 반환.
 * @param kaptCode 단지코드 (fetchAptComplexList 결과의 kaptCode)
 * @param withDetail 상세정보(주차 등)까지 받을지 — 쿼터를 아끼려면 false (기본 true)
 */
export async function fetchAptComplexDetail(
  kaptCode: string,
  withDetail = true,
): Promise<{ detail: AptComplexDetail | null; mode: "live" | "mock" }> {
  const { items, mode } = await fetchAptJson(
    "AptBasisInfoServiceV4",
    "getAphusBassInfoV4",
    { kaptCode },
    1,
  );
  if (items.length === 0) return { detail: null, mode };
  let detail = normalizeComplexDetail(toStrRow(items[0]));

  if (withDetail) {
    try {
      const dtl = await fetchAptJson(
        "AptBasisInfoServiceV4",
        "getAphusDtlInfoV4",
        { kaptCode },
        1,
      );
      if (dtl.items[0]) detail = mergeDetailInfo(detail, toStrRow(dtl.items[0]));
    } catch {
      // 상세정보 실패는 치명적이지 않다 — 기본정보만으로 진행.
    }
  }
  return { detail, mode };
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
