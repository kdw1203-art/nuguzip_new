/**
 * 주택담보대출 금리 — 금융감독원 "금융상품 한눈에"(finlife.fss.or.kr) 공시 API 실연동.
 *
 * FINLIFE_API_KEY 가 설정되면 은행권(topFinGrpNo=020000) 주담대 상품의 공시 금리를
 * 은행별 변동/고정 min~max 로 집계해 실데이터를 반환한다. 키 미설정·실패 시 폴백 표.
 * 캐시: public_data_cache(24h) 재사용.
 */
import "server-only";
import { readPublicDataCache, writePublicDataCache } from "@/lib/public-data";
import { logger } from "@/lib/log";

export interface MortgageRate {
  bank: string;
  /** "3.62~5.13%" 형식 (없으면 "-") */
  variable: string;
  fixed: string;
  note: string;
}

export interface MortgageRatesResult {
  live: boolean;
  /** 출처 라벨 */
  source: string;
  /** 공시 기준월 (YYYY-MM) — 실데이터일 때만 */
  asOf: string | null;
  rates: MortgageRate[];
}

/** 공시 API 연동 전·실패 시 사용하는 폴백 표 (대략적 시장 범위). */
export const FALLBACK_MORTGAGE_RATES: MortgageRate[] = [
  { bank: "케이뱅크", variable: "3.62~5.13%", fixed: "3.48~4.79%", note: "비대면 전용" },
  { bank: "카카오뱅크", variable: "3.71~5.02%", fixed: "3.55~4.66%", note: "중도상환 면제" },
  { bank: "KB국민", variable: "3.94~5.34%", fixed: "3.79~5.19%", note: "주거래 우대" },
  { bank: "신한", variable: "3.98~5.28%", fixed: "3.83~5.11%", note: "급여이체 우대" },
  { bank: "하나", variable: "4.01~5.31%", fixed: "3.88~5.18%", note: "전자약정 우대" },
];

export function isMortgageRateLive(): boolean {
  return Boolean(process.env.FINLIFE_API_KEY?.trim());
}

const CACHE_KEY = "finlife:mortgage-rates:020000";
const TTL_MS = 24 * 3_600_000;
const BASE = "https://finlife.fss.or.kr/finlifeapi/mortgageLoanProductsSearch.json";

interface FinlifeBase {
  fin_co_no?: string;
  kor_co_nm?: string;
}
interface FinlifeOption {
  fin_co_no?: string;
  lend_rate_type_nm?: string; // "변동금리" | "고정금리" | "혼합금리" 등
  lend_rate_min?: string;
  lend_rate_max?: string;
}
interface FinlifeResult {
  result?: {
    err_cd?: string;
    err_msg?: string;
    max_page_no?: number;
    dcls_month?: string;
    baseList?: FinlifeBase[];
    optionList?: FinlifeOption[];
  };
}

/** 은행명 약식화 (UI 폭 절약: "주식회사 카카오뱅크" → "카카오뱅크", "국민은행" → "KB국민"). */
function shortBankName(name: string): string {
  let n = name.replace(/주식회사|㈜/g, "").trim();
  const map: Record<string, string> = {
    국민은행: "KB국민",
    신한은행: "신한",
    하나은행: "하나",
    우리은행: "우리",
    한국스탠다드차타드은행: "SC제일",
    엔에이치농협은행: "NH농협",
    농협은행: "NH농협",
    중소기업은행: "IBK기업",
    아이엠뱅크: "iM뱅크",
    카카오뱅크: "카카오뱅크",
    케이뱅크: "케이뱅크",
    토스뱅크: "토스뱅크",
  };
  for (const [k, v] of Object.entries(map)) if (n.includes(k.replace(/은행$/, "")) || n === k) n = v;
  return n.replace(/은행$/, "");
}

function num(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rangeLabel(min: number | null, max: number | null): string {
  if (min == null && max == null) return "-";
  if (min != null && max != null)
    return min === max ? `${min.toFixed(2)}%` : `${min.toFixed(2)}~${max.toFixed(2)}%`;
  const v = (min ?? max) as number;
  return `${v.toFixed(2)}%`;
}

async function fetchPage(pageNo: number): Promise<FinlifeResult["result"] | null> {
  const key = process.env.FINLIFE_API_KEY?.trim();
  if (!key) return null;
  const qs = new URLSearchParams({ auth: key, topFinGrpNo: "020000", pageNo: String(pageNo) });
  const res = await fetch(`${BASE}?${qs.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`finlife HTTP ${res.status}`);
  const json = (await res.json()) as FinlifeResult;
  return json.result ?? null;
}

interface BankAgg {
  bank: string;
  varMin: number | null;
  varMax: number | null;
  fixMin: number | null;
  fixMax: number | null;
}

async function fetchLive(): Promise<MortgageRatesResult | null> {
  const first = await fetchPage(1);
  if (!first || (first.err_cd && first.err_cd !== "000")) {
    logger.warn("[finlife] err", first?.err_cd, first?.err_msg);
    return null;
  }
  const maxPage = Math.min(first.max_page_no ?? 1, 5);
  const bases: FinlifeBase[] = [...(first.baseList ?? [])];
  const options: FinlifeOption[] = [...(first.optionList ?? [])];
  for (let p = 2; p <= maxPage; p += 1) {
    try {
      const r = await fetchPage(p);
      if (r) {
        bases.push(...(r.baseList ?? []));
        options.push(...(r.optionList ?? []));
      }
    } catch (err) {
      logger.warn(`[finlife] page ${p} failed`, err);
    }
  }

  const nameByCo = new Map<string, string>();
  for (const b of bases) if (b.fin_co_no) nameByCo.set(b.fin_co_no, b.kor_co_nm ?? b.fin_co_no);

  const agg = new Map<string, BankAgg>();
  const merge = (cur: number | null, next: number | null, mode: "min" | "max"): number | null => {
    if (next == null) return cur;
    if (cur == null) return next;
    return mode === "min" ? Math.min(cur, next) : Math.max(cur, next);
  };
  for (const o of options) {
    const co = o.fin_co_no;
    if (!co) continue;
    const bank = shortBankName(nameByCo.get(co) ?? co);
    const a = agg.get(co) ?? { bank, varMin: null, varMax: null, fixMin: null, fixMax: null };
    const min = num(o.lend_rate_min);
    const max = num(o.lend_rate_max);
    const type = o.lend_rate_type_nm ?? "";
    if (type.includes("변동") || type.includes("혼합")) {
      a.varMin = merge(a.varMin, min, "min");
      a.varMax = merge(a.varMax, max, "max");
    } else if (type.includes("고정")) {
      a.fixMin = merge(a.fixMin, min, "min");
      a.fixMax = merge(a.fixMax, max, "max");
    }
    agg.set(co, a);
  }

  const rates: MortgageRate[] = [...agg.values()]
    .filter((a) => a.varMin != null || a.fixMin != null)
    .sort((x, y) => (x.varMin ?? x.fixMin ?? 99) - (y.varMin ?? y.fixMin ?? 99))
    .slice(0, 6)
    .map((a) => ({
      bank: a.bank,
      variable: rangeLabel(a.varMin, a.varMax),
      fixed: rangeLabel(a.fixMin, a.fixMax),
      note: "",
    }));

  if (rates.length === 0) return null;
  const dcls = first.dcls_month ?? "";
  const asOf = /^\d{6}$/.test(dcls) ? `${dcls.slice(0, 4)}-${dcls.slice(4, 6)}` : null;
  return { live: true, source: "금융감독원 금융상품 한눈에", asOf, rates };
}

/** 주담대 금리 (실데이터 우선, 폴백 포함). 24h 캐시. */
export async function getMortgageRates(): Promise<MortgageRatesResult> {
  if (!isMortgageRateLive()) {
    return { live: false, source: "샘플", asOf: null, rates: FALLBACK_MORTGAGE_RATES };
  }
  const cached = (await readPublicDataCache(CACHE_KEY)) as MortgageRatesResult | null;
  if (cached?.live && cached.rates?.length) return cached;
  try {
    const live = await fetchLive();
    if (live) {
      await writePublicDataCache(CACHE_KEY, live, TTL_MS);
      return live;
    }
  } catch (err) {
    logger.warn("[finlife] live fetch failed, fallback", err);
  }
  return { live: false, source: "샘플", asOf: null, rates: FALLBACK_MORTGAGE_RATES };
}
