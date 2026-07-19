import { fetchMolitAptTrade } from "@/lib/national-data/molit-api";
import { WORKBENCH_COMPLEXES } from "@/lib/ai/workbench-constants";
import { getTransactionHistory } from "@/lib/complex/complex-store";

export type PriceViewStatus = "undervalued" | "fair" | "overheated" | "insufficient_data";

export type PriceAnalysisResult = {
  status: PriceViewStatus;
  reason: string;
  estimateRange: { min: number; max: number };
  recentDeals: Array<{ date: string; priceMan: number; areaSqm: number; floor?: string }>;
  avgRecentMan: number | null;
  jeonseRatio: number | null;
  dealCount: number;
  source: "live" | "mock" | "workbench";
  disclaimer: string;
};

function parseDealPrice(row: Record<string, unknown>): number | null {
  const raw = row.dealAmount ?? row.거래금액;
  if (raw == null) return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseArea(row: Record<string, unknown>): number {
  const raw = row.excluUseAr ?? row.전용면적;
  const n = Number(String(raw ?? "0").trim());
  return Number.isFinite(n) && n > 0 ? n : 84;
}

function matchAptName(row: Record<string, unknown>, aptName?: string): boolean {
  if (!aptName?.trim()) return true;
  const name = String(row.aptNm ?? row.아파트 ?? "").trim();
  const q = aptName.trim();
  return name.includes(q) || q.includes(name);
}

function workbenchFallback(district?: string, aptName?: string): PriceAnalysisResult | null {
  const q = aptName?.trim();
  const d = district?.trim();
  let c = WORKBENCH_COMPLEXES.find((x) => q && x.name.includes(q));
  if (!c && d) {
    c = WORKBENCH_COMPLEXES.find((x) => x.districtLabel.includes(d) || d.includes(x.districtLabel));
  }
  if (!c) c = WORKBENCH_COMPLEXES[0];
  if (!c) return null;

  const base = c.priceSaleMan;
  const spread = Math.round(base * 0.04);
  const ratio = c.priceJeonMan / base;

  let status: PriceViewStatus = "fair";
  let reason = "워크벤치 시세 기준 적정 구간으로 추정됩니다.";
  if (ratio < 0.55) {
    status = "overheated";
    reason = "전세가율이 낮아 갭투자 부담이 큰 구간일 수 있습니다.";
  } else if (c.liquidityIdx >= 80 && c.devScore >= 85) {
    status = "undervalued";
    reason = "거래 유동성·개발 호재 대비 상대적 저평가 가능성이 있습니다.";
  }

  return {
    status,
    reason,
    estimateRange: { min: base - spread, max: base + spread },
    recentDeals: [
      { date: "최근", priceMan: base, areaSqm: c.areaSqm, floor: "중층" },
    ],
    avgRecentMan: base,
    jeonseRatio: Math.round(ratio * 1000) / 10,
    dealCount: 1,
    source: "workbench",
    disclaimer: "워크벤치 샘플 시세 기반 AI 추정입니다. 실거래·호가를 반드시 확인하세요.",
  };
}

export async function analyzePrice(input: {
  district?: string;
  aptName?: string;
  complexId?: string;
}): Promise<PriceAnalysisResult> {
  const complex = input.complexId
    ? WORKBENCH_COMPLEXES.find((c) => c.id === input.complexId)
    : undefined;

  const district = input.district ?? complex?.districtLabel;
  const aptName = input.aptName ?? complex?.name;

  if (input.complexId) {
    const dbTx = await getTransactionHistory(input.complexId, 8);
    if (dbTx.length > 0) {
      const prices = dbTx.map((t) => t.avg_manwon).filter((n) => n > 0);
      const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const jeon = complex?.priceJeonMan;
      return {
        status: "fair" as PriceViewStatus,
        reason: "업로드·ingest된 실거래 캐시 기준입니다.",
        estimateRange: { min: Math.round(min * 0.98), max: Math.round(max * 1.02) },
        recentDeals: dbTx.map((t) => ({
          date: `${t.yyyymm.slice(0, 4)}.${t.yyyymm.slice(4, 6)}`,
          priceMan: t.avg_manwon,
          areaSqm: t.area_m2 ?? complex?.areaSqm ?? 84,
        })),
        avgRecentMan: avg,
        jeonseRatio: jeon && avg > 0 ? Math.round((jeon / avg) * 1000) / 10 : null,
        dealCount: dbTx.length,
        source: "live" as const,
        disclaimer: "complex_transactions 캐시 · AI 추정 참고용",
      };
    }
  }

  const { rows, mode } = await fetchMolitAptTrade({ district });

  const matched = rows
    .filter((r) => matchAptName(r, aptName))
    .map((r) => ({
      date: String(r.dealYear ?? r.년 ?? "") + "." + String(r.dealMonth ?? r.월 ?? "").padStart(2, "0"),
      priceMan: parseDealPrice(r) ?? 0,
      areaSqm: parseArea(r),
      floor: String(r.floor ?? r.층 ?? ""),
    }))
    .filter((d) => d.priceMan > 0)
    .slice(0, 8);

  if (matched.length === 0) {
    const fb = workbenchFallback(district, aptName);
    if (fb) return fb;
    return {
      status: "insufficient_data",
      reason: "최근 실거래·시세 데이터가 부족합니다.",
      estimateRange: { min: 0, max: 0 },
      recentDeals: [],
      avgRecentMan: null,
      jeonseRatio: null,
      dealCount: 0,
      source: mode === "live" ? "live" : "mock",
      disclaimer: "AI 추정 · 투자 판단 참고용",
    };
  }

  const prices = matched.map((d) => d.priceMan);
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const spread = max - min;
  const spreadPct = avg > 0 ? spread / avg : 0;

  let status: PriceViewStatus = "fair";
  let reason = "최근 실거래 중앙값 기준 적정 구간으로 보입니다.";
  if (spreadPct > 0.12) {
    status = "overheated";
    reason = "최근 실거래 분산이 커 고점 거래 비중을 점검할 필요가 있습니다.";
  } else if (spreadPct < 0.04 && matched.length >= 3) {
    status = "undervalued";
    reason = "최근 실거래가 안정적이며 협상 여지가 있을 수 있습니다.";
  }

  const jeon = complex?.priceJeonMan;
  const jeonseRatio =
    jeon && avg > 0 ? Math.round((jeon / avg) * 1000) / 10 : null;

  return {
    status,
    reason,
    estimateRange: {
      min: Math.round(min * 0.98),
      max: Math.round(max * 1.02),
    },
    recentDeals: matched,
    avgRecentMan: avg,
    jeonseRatio,
    dealCount: matched.length,
    source: mode === "live" ? "live" : "mock",
    disclaimer: "국토부 실거래·내부 시세 기반 AI 추정입니다. 호가·세금·대출 조건은 별도 확인하세요.",
  };
}

export const PRICE_STATUS_LABEL: Record<PriceViewStatus, string> = {
  undervalued: "저평가 가능",
  fair: "적정",
  overheated: "과열 주의",
  insufficient_data: "데이터 부족",
};
