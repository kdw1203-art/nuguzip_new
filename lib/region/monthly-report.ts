import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { transactionNameCandidates } from "@/lib/market/store";
import { logger } from "@/lib/log";

/* [#79] 월간 지역 리포트 — /region/[id]/report/[ym] 의 데이터 계층.
 *
 * "그때 얼마였지" 검색의 수신처: 특정 월에 고정된 스냅샷 페이지를 실데이터로만
 * 조립한다. 규칙은 지역 허브와 동일 — 산술 사실만, 없으면 문장을 만들지 않는다.
 *
 * 검증 가능한 월 범위: 2024-01 ~ 지난달(완결 월). 이번 달은 신고가 진행 중이라
 * "월간" 스냅샷이 아직 사실이 아니다 — 페이지 자체를 만들지 않는다(404).
 */

export type MonthlyReportTopDeal = {
  complexName: string;
  areaM2: number | null;
  priceKrw: number;
  contractDay: number | null;
};

export type RegionMonthlyReport = {
  /** yyyymm */
  ym: string;
  /** 해당 월 매매 신고 건수 (market_region_monthly) — 없으면 null */
  tradeCount: number | null;
  /** 전월 매매 신고 건수 */
  prevTradeCount: number | null;
  /** 해당 월 평균 매매가 (KRW, market_region_monthly.avg_deal_amount_krw) */
  avgDealKrw: number | null;
  /** 해당 월 전월세 신고 건수 */
  rentCount: number | null;
  /** 매매가격지수 (해당 월·전월) — market_region_series */
  index: { value: number; prev: number | null } | null;
  /** 해당 월 상위 실거래 (금액순 5건) */
  topDeals: MonthlyReportTopDeal[];
  /** 해당 월 중앙값 (표본 상한 내) */
  medianDealKrw: number | null;
  /** 표본 수·상한 도달 여부 */
  sampleCount: number;
  sampleTruncated: boolean;
};

const SAMPLE_CAP = 3000;

/** "2026-07" → "202607" | null */
export function parseReportMonth(slug: string): string | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(slug.trim());
  if (!m) return null;
  const ym = `${m[1]}${m[2]}`;
  if (ym < "202401") return null; // 아카이브 시작점 — 그 전 월은 만들지 않는다
  return ym <= lastCompletedYm() ? ym : null;
}

/** 지난달(완결 월) yyyymm */
export function lastCompletedYm(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 최근 n개 완결 월 (최신 먼저), "yyyy-mm" 슬러그 배열 */
export function recentReportSlugs(n = 12): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 1; i <= n; i++) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const slug = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
    if (`${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, "0")}` < "202401") break;
    out.push(slug);
  }
  return out;
}

function prevYm(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * 월 고정 리포트 데이터. 모든 소스가 비어 있으면 null(리포트 없음).
 * 부분 실패는 해당 항목 null 로 접되, **전부** 못 읽었을 때는 throw —
 * "그 달 거래가 없었다"와 "지금 못 읽었다"를 같은 화면으로 만들지 않는다.
 */
export async function getRegionMonthlyReport(
  regionId: string,
  regionName: string,
  ym: string,
): Promise<RegionMonthlyReport | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const names = transactionNameCandidates(regionId, regionName);
  const pym = prevYm(ym);

  const monthlyQ = sb
    .from("market_region_monthly")
    .select("month, deal_type, transaction_count, avg_deal_amount_krw")
    .in("region_name", names)
    .eq("property_type", "apartment")
    .in("month", [ym, pym]);

  const seriesQ = sb
    .from("market_region_series")
    .select("period,value")
    .eq("region_id", regionId)
    .eq("property_type", "apt")
    .eq("metric", "sale_index")
    .eq("period_type", "monthly")
    .in("period", [ym, pym]);

  const txQ = sb
    .from("market_transactions")
    .select("complex_name, area_m2, deal_amount_krw, contract_day")
    .in("region_name", names)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .eq("property_type", "apartment")
    .eq("contract_ym", ym)
    .not("deal_amount_krw", "is", null)
    .order("deal_amount_krw", { ascending: false })
    .limit(SAMPLE_CAP);

  const [monthlyR, seriesR, txR] = await Promise.allSettled([monthlyQ, seriesQ, txQ]);

  const failures: string[] = [];
  let tradeCount: number | null = null;
  let prevTradeCount: number | null = null;
  let rentCount: number | null = null;
  let avgDealKrw: number | null = null;
  if (monthlyR.status === "fulfilled" && !monthlyR.value.error) {
    for (const r of monthlyR.value.data ?? []) {
      const cnt = Number(r.transaction_count) || 0;
      if (r.deal_type === "trade" && String(r.month) === ym) {
        tradeCount = (tradeCount ?? 0) + cnt;
        const avg = Number(r.avg_deal_amount_krw);
        if (Number.isFinite(avg) && avg > 0) avgDealKrw = avg;
      } else if (r.deal_type === "trade" && String(r.month) === pym) {
        prevTradeCount = (prevTradeCount ?? 0) + cnt;
      } else if (r.deal_type === "rent" && String(r.month) === ym) {
        rentCount = (rentCount ?? 0) + cnt;
      }
    }
  } else {
    failures.push("월별 집계");
    logger.error(
      `[monthly-report] 집계 조회 실패(${regionId} ${ym})`,
      monthlyR.status === "fulfilled" ? monthlyR.value.error : monthlyR.reason,
    );
  }

  let index: RegionMonthlyReport["index"] = null;
  if (seriesR.status === "fulfilled" && !seriesR.value.error) {
    const rows = seriesR.value.data ?? [];
    const cur = rows.find((r) => String(r.period) === ym);
    const prev = rows.find((r) => String(r.period) === pym);
    if (cur && Number.isFinite(Number(cur.value))) {
      index = {
        value: Number(cur.value),
        prev: prev && Number.isFinite(Number(prev.value)) ? Number(prev.value) : null,
      };
    }
  } else {
    failures.push("가격지수");
  }

  let topDeals: MonthlyReportTopDeal[] = [];
  let medianDealKrw: number | null = null;
  let sampleCount = 0;
  let sampleTruncated = false;
  if (txR.status === "fulfilled" && !txR.value.error) {
    const rows = txR.value.data ?? [];
    sampleCount = rows.length;
    sampleTruncated = rows.length >= SAMPLE_CAP;
    topDeals = rows.slice(0, 5).map((r) => ({
      complexName: String(r.complex_name ?? "단지명 미상"),
      areaM2: r.area_m2 === null ? null : Number(r.area_m2),
      priceKrw: Number(r.deal_amount_krw) || 0,
      contractDay: r.contract_day === null ? null : Number(r.contract_day),
    }));
    const prices = rows
      .map((r) => Number(r.deal_amount_krw))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    medianDealKrw = median(prices);
  } else {
    failures.push("실거래 표본");
  }

  if (failures.length >= 3) {
    throw new Error(`월간 리포트 전 소스 조회 실패 (${failures.join(", ")})`);
  }

  const empty =
    (tradeCount === null || tradeCount === 0) &&
    (rentCount === null || rentCount === 0) &&
    index === null &&
    sampleCount === 0;
  if (empty) return null;

  return {
    ym,
    tradeCount,
    prevTradeCount,
    avgDealKrw,
    rentCount,
    index,
    topDeals,
    medianDealKrw,
    sampleCount,
    sampleTruncated,
  };
}
