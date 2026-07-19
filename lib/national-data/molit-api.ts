import { encodingKeyForUrl } from "@/lib/public-data/data-go-kr-keys";
import { resolveSigunguCd } from "@/lib/national-data/region-codes";

/**
 * 지역명 → 5자리 LAWD_CD (MOLIT API 파라미터).
 * 전국 시군구를 지원하며 region-codes.ts 의 테이블을 사용한다.
 */
export function resolveLawdCode(district?: string): string {
  return resolveSigunguCd(district);
}

function molitKey(): string | null {
  return encodingKeyForUrl();
}
function defaultDealYmd(yyyymm?: string): string {
  if (yyyymm?.trim()) return yyyymm.trim();
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseMolitXmlItems(text: string): Record<string, unknown>[] {
  return [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const block = m[1];
    const row: Record<string, unknown> = {};
    for (const tag of block.matchAll(/<([^/>]+)>([^<]*)<\//g)) {
      row[tag[1]] = tag[2];
    }
    return row;
  });
}

async function fetchMolitRtms(
  path: string,
  params: { district?: string; yyyymm?: string; numOfRows?: number },
): Promise<{ rows: Record<string, unknown>[]; mode: "live" | "mock" }> {
  const key = molitKey();
  if (!key) return { rows: [], mode: "mock" };

  const lawd = resolveLawdCode(params.district);
  const dealYmd = defaultDealYmd(params.yyyymm);

  const url = new URL(`https://apis.data.go.kr/1613000/${path}`);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("LAWD_CD", lawd);
  url.searchParams.set("DEAL_YMD", dealYmd);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", String(params.numOfRows ?? 30));

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    const text = await res.text();
    const items = parseMolitXmlItems(text);
    if (items.length > 0) return { rows: items, mode: "live" };
  } catch {
    // fall through
  }
  return { rows: [], mode: "mock" };
}

export async function fetchMolitAptTrade(params: {
  district?: string;
  yyyymm?: string;
}): Promise<{ rows: Record<string, unknown>[]; mode: "live" | "mock" }> {
  return fetchMolitRtms("RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade", params);
}

export async function fetchMolitAptRent(params: {
  district?: string;
  yyyymm?: string;
}): Promise<{ rows: Record<string, unknown>[]; mode: "live" | "mock" }> {
  return fetchMolitRtms("RTMSDataSvcAptRent/getRTMSDataSvcAptRent", params);
}

// ── 전체 부동산 유형 실거래가 (apis.data.go.kr/1613000/RTMSDataSvc*) ──────────
// 단일 일반 인증키(MOLIT_SERVICE_KEY)로 11종 매매·전월세 실거래가를 조회한다.

export type MolitRtmsType =
  | "apt-sale"
  | "apt-sale-detail"
  | "apt-rent"
  | "offi-sale"
  | "offi-rent"
  | "rh-sale" // 연립다세대 매매
  | "sh-sale" // 단독/다가구 매매
  | "sh-rent" // 단독/다가구 전월세
  | "land-sale" // 토지 매매
  | "silv-sale" // 아파트 분양권전매
  | "nrg-sale"; // 상업업무용 매매

interface RtmsTypeConfig {
  service: string;
  kind: "trade" | "rent";
  /** 단지/건물명 필드 (없으면 유형/지목/용도) */
  nameField: string;
  /** 면적 필드 (전용/연면적/대지/거래면적) */
  areaField: string;
}

const RTMS_TYPES: Record<MolitRtmsType, RtmsTypeConfig> = {
  "apt-sale": { service: "RTMSDataSvcAptTrade", kind: "trade", nameField: "aptNm", areaField: "excluUseAr" },
  "apt-sale-detail": { service: "RTMSDataSvcAptTradeDev", kind: "trade", nameField: "aptNm", areaField: "excluUseAr" },
  "apt-rent": { service: "RTMSDataSvcAptRent", kind: "rent", nameField: "aptNm", areaField: "excluUseAr" },
  "offi-sale": { service: "RTMSDataSvcOffiTrade", kind: "trade", nameField: "offiNm", areaField: "excluUseAr" },
  "offi-rent": { service: "RTMSDataSvcOffiRent", kind: "rent", nameField: "offiNm", areaField: "excluUseAr" },
  "rh-sale": { service: "RTMSDataSvcRHTrade", kind: "trade", nameField: "mhouseNm", areaField: "excluUseAr" },
  "sh-sale": { service: "RTMSDataSvcSHTrade", kind: "trade", nameField: "houseType", areaField: "totalFloorAr" },
  "sh-rent": { service: "RTMSDataSvcSHRent", kind: "rent", nameField: "houseType", areaField: "totalFloorAr" },
  "land-sale": { service: "RTMSDataSvcLandTrade", kind: "trade", nameField: "jimok", areaField: "dealArea" },
  "silv-sale": { service: "RTMSDataSvcSilvTrade", kind: "trade", nameField: "aptNm", areaField: "excluUseAr" },
  "nrg-sale": { service: "RTMSDataSvcNrgTrade", kind: "trade", nameField: "buildingUse", areaField: "buildingAr" },
};

export interface MolitDeal {
  name?: string;
  umd?: string;
  /** 매매가(만원) */
  dealManwon?: number;
  /** 전월세 보증금(만원) */
  depositManwon?: number;
  /** 월세(만원) */
  monthlyManwon?: number;
  areaM2?: number;
  floor?: number;
  buildYear?: number;
  /** YYYY-MM-DD */
  dealDate: string;
  raw: Record<string, string>;
}

/** "85,000" → 85000 (만원, 콤마 제거) */
function parseManwon(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : undefined;
}

function toDealDate(r: Record<string, unknown>): string {
  const y = String(r.dealYear ?? "").trim();
  const m = String(r.dealMonth ?? "").trim().padStart(2, "0");
  const d = String(r.dealDay ?? "").trim().padStart(2, "0");
  if (y && m && d && m !== "00") return `${y}-${m}-${d}`;
  return "";
}

function normalizeDeal(cfg: RtmsTypeConfig, r: Record<string, unknown>): MolitDeal {
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) raw[k] = String(v ?? "");
  const areaNum = Number(String(r[cfg.areaField] ?? "").replace(/,/g, ""));
  return {
    name: r[cfg.nameField] != null ? String(r[cfg.nameField]).trim() || undefined : undefined,
    umd: r.umdNm != null ? String(r.umdNm).trim() || undefined : undefined,
    dealManwon: cfg.kind === "trade" ? parseManwon(r.dealAmount) : undefined,
    depositManwon: cfg.kind === "rent" ? parseManwon(r.deposit) : undefined,
    monthlyManwon: cfg.kind === "rent" ? parseManwon(r.monthlyRent) : undefined,
    areaM2: Number.isFinite(areaNum) && areaNum > 0 ? areaNum : undefined,
    floor: r.floor != null && String(r.floor).trim() ? Number(r.floor) : undefined,
    buildYear: r.buildYear != null && String(r.buildYear).trim() ? Number(r.buildYear) : undefined,
    dealDate: toDealDate(r),
    raw,
  };
}

/** 유형별 실거래가 조회 → 정규화된 거래 목록. */
export async function fetchMolitDeals(
  type: MolitRtmsType,
  params: { district?: string; yyyymm?: string; numOfRows?: number },
): Promise<{ deals: MolitDeal[]; mode: "live" | "mock" }> {
  const cfg = RTMS_TYPES[type];
  const { rows, mode } = await fetchMolitRtms(
    `${cfg.service}/get${cfg.service}`,
    params,
  );
  return { deals: rows.map((r) => normalizeDeal(cfg, r)), mode };
}

/** 거래 목록 요약(건수·평균 매매가/㎡·평균 보증금). */
export function summarizeDeals(deals: MolitDeal[]): {
  count: number;
  avgDealManwon?: number;
  avgPerM2Won?: number;
  avgDepositManwon?: number;
} {
  if (deals.length === 0) return { count: 0 };
  const trades = deals.filter((d) => typeof d.dealManwon === "number");
  const perM2: number[] = [];
  let dealSum = 0;
  for (const d of trades) {
    dealSum += d.dealManwon as number;
    if (d.areaM2 && d.areaM2 > 0) perM2.push(((d.dealManwon as number) * 10000) / d.areaM2);
  }
  const rents = deals.filter((d) => typeof d.depositManwon === "number");
  const depSum = rents.reduce((a, d) => a + (d.depositManwon as number), 0);
  return {
    count: deals.length,
    avgDealManwon: trades.length ? Math.round(dealSum / trades.length) : undefined,
    avgPerM2Won: perM2.length ? Math.round(perM2.reduce((a, b) => a + b, 0) / perM2.length) : undefined,
    avgDepositManwon: rents.length ? Math.round(depSum / rents.length) : undefined,
  };
}
