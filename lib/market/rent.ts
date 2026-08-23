import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { transactionNameCandidates } from "@/lib/market/store";
import { logger } from "@/lib/log";

/* [#94, 2026-08-23] 전월세 실거래 표면화 — 46.9만 행(216개 지역, 최근 12개월)이
 * DB에 있는데 보여주는 화면이 없었다. 이 모듈은 지역 단위 전월세 스냅샷을
 * 두 쿼리로 만든다:
 *   1) market_region_monthly(deal_type='rent') — 12개월 거래량(집계 테이블, 값싸다)
 *   2) market_transactions(rent, 최근 3개월) — 전세 보증금·월세 중앙값(원본, 상한 4000행)
 * 원칙: 중앙값·건수 같은 산술 사실만. 신고 지연과 갱신·신규 미구분(원천 한계)은
 * 화면에 명기한다.
 */

export type RegionRentSnapshot = {
  /** 12개월 월별 전월세 신고 건수 (오름차순 yyyymm) */
  monthly: Array<{ month: string; count: number }>;
  /** 최근 3개월 표본 크기 */
  sampleCount: number;
  /** 표본이 상한(4000)에 닿아 잘렸을 수 있음 */
  sampleTruncated: boolean;
  jeonse: {
    count: number;
    /** 전체 전세 보증금 중앙값 (KRW) */
    medianDepositKrw: number | null;
    /** 59~85㎡(국민평형대) 전세 보증금 중앙값 — 표본 10건 미만이면 null */
    medianDepositKrw59_85: number | null;
  };
  wolse: {
    count: number;
    medianDepositKrw: number | null;
    medianMonthlyKrw: number | null;
  };
  /** 최근 3개월 중 월세 비중 (0~1) */
  wolseShare: number | null;
  /** 표본 기간 라벨 (예: "2026.06~2026.08") */
  periodLabel: string;
};

const SAMPLE_CAP = 4000;

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function ymMonthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function getRegionRentSnapshot(
  regionId: string,
  regionName: string,
  signal?: AbortSignal,
): Promise<RegionRentSnapshot | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const names = transactionNameCandidates(regionId, regionName);
  const from3 = ymMonthsAgo(2); // 이번 달 포함 3개 캘린더 월
  const from12 = ymMonthsAgo(11);

  let volQ = sb
    .from("market_region_monthly")
    .select("month, transaction_count")
    .in("region_name", names)
    .eq("deal_type", "rent")
    .eq("property_type", "apartment")
    .gte("month", from12)
    .order("month", { ascending: true })
    .limit(14);
  if (signal) volQ = volQ.abortSignal(signal);

  let rowQ = sb
    .from("market_transactions")
    .select("deposit_krw, monthly_rent_krw, area_m2, contract_ym")
    .in("region_name", names)
    .eq("transaction_type", "rent")
    .eq("is_cancelled", false)
    .eq("property_type", "apartment")
    .gte("contract_ym", from3)
    .not("deposit_krw", "is", null)
    .limit(SAMPLE_CAP);
  if (signal) rowQ = rowQ.abortSignal(signal);

  const [volRes, rowRes] = await Promise.all([volQ, rowQ]);
  if (volRes.error) {
    logger.error(`[rent] 월별 집계 조회 실패(${regionId})`, volRes.error);
    throw new Error(`market_region_monthly(rent) 조회 실패: ${volRes.error.message}`);
  }
  if (rowRes.error) {
    logger.error(`[rent] 원본 표본 조회 실패(${regionId})`, rowRes.error);
    throw new Error(`market_transactions(rent) 조회 실패: ${rowRes.error.message}`);
  }

  const monthlyMap = new Map<string, number>();
  for (const r of volRes.data ?? []) {
    const m = String(r.month ?? "");
    if (!/^\d{6}$/.test(m)) continue;
    monthlyMap.set(m, (monthlyMap.get(m) ?? 0) + (Number(r.transaction_count) || 0));
  }
  const monthly = [...monthlyMap.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const rows = (rowRes.data ?? []) as Array<Record<string, unknown>>;
  if (monthly.length === 0 && rows.length === 0) return null;

  const jeonseDeposits: number[] = [];
  const jeonseDeposits5985: number[] = [];
  const wolseDeposits: number[] = [];
  const wolseMonthlies: number[] = [];
  for (const r of rows) {
    const deposit = Number(r.deposit_krw);
    const monthlyRent = Number(r.monthly_rent_krw ?? 0) || 0;
    if (!Number.isFinite(deposit) || deposit <= 0) continue;
    const area = r.area_m2 === null ? null : Number(r.area_m2);
    if (monthlyRent > 0) {
      wolseDeposits.push(deposit);
      wolseMonthlies.push(monthlyRent);
    } else {
      jeonseDeposits.push(deposit);
      if (area !== null && area >= 59 && area <= 85) jeonseDeposits5985.push(deposit);
    }
  }
  jeonseDeposits.sort((a, b) => a - b);
  jeonseDeposits5985.sort((a, b) => a - b);
  wolseDeposits.sort((a, b) => a - b);
  wolseMonthlies.sort((a, b) => a - b);

  const total = jeonseDeposits.length + wolseDeposits.length;
  const fmtYm = (ym: string) => `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;

  return {
    monthly,
    sampleCount: rows.length,
    sampleTruncated: rows.length >= SAMPLE_CAP,
    jeonse: {
      count: jeonseDeposits.length,
      medianDepositKrw: median(jeonseDeposits),
      medianDepositKrw59_85:
        jeonseDeposits5985.length >= 10 ? median(jeonseDeposits5985) : null,
    },
    wolse: {
      count: wolseDeposits.length,
      medianDepositKrw: median(wolseDeposits),
      medianMonthlyKrw: median(wolseMonthlies),
    },
    wolseShare: total > 0 ? wolseDeposits.length / total : null,
    periodLabel: `${fmtYm(from3)}~${fmtYm(ymMonthsAgo(0))}`,
  };
}
