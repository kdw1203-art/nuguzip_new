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

/** 워크벤치 가짜 시세/저평가 판정은 오픈 정책상 금지 — 호출해도 항상 null */
function workbenchFallback(_district?: string, _aptName?: string): PriceAnalysisResult | null {
  return null;
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
        reason: "국토부 실거래 신고분의 월별 평균 기준입니다.",
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
        /* #150 — 이전 문구는 "complex_transactions 캐시" 였는데 그 테이블은 운영 DB에
           존재하지 않는다. 실제 출처는 market_transactions(국토부 실거래 신고분)를
           getTransactionHistory 가 월별로 평균 낸 값이다. 그리고 그 평균은 전용면적을
           구분하지 않으므로, 큰 평형이 팔린 달은 단지가 오른 것처럼 보인다 —
           사용자가 그 한계를 알고 봐야 하는 값이라 문구에 그대로 적는다. */
        disclaimer: "국토부 실거래 월별 평균(전용면적 구분 없음) · AI 추정 참고용",
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
    void workbenchFallback(district, aptName);
    return {
      status: "insufficient_data",
      reason: "최근 실거래·시세 데이터가 부족합니다. 샘플 시세로 저평가·고평가를 지어내지 않습니다.",
      estimateRange: { min: 0, max: 0 },
      recentDeals: [],
      avgRecentMan: null,
      jeonseRatio: null,
      dealCount: 0,
      source: mode === "live" ? "live" : "mock",
      disclaimer: "실거래 부족 · 추정 점수 미제공",
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
