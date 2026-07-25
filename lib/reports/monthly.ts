/**
 * S11/G7 — 월간 실거래 리포트 데이터 레이어.
 *
 * market_region_monthly(실거래 집계 테이블)에서 읽기만 한다 — 사람이 쓰는 글이
 * 아니라 데이터 요약이므로, 여기 없는 수치는 리포트에도 없다. 신고 지연
 * (계약 후 30일)이 있는 최근 월은 isProvisional 로 표시해 화면이 명기하게 한다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";

export type ReportMonthSummary = {
  /** yyyymm */
  ym: string;
  regionCount: number;
  txCount: number;
};

export type ReportRegionRow = {
  regionName: string;
  txCount: number;
  avgKrw: number | null;
  perPyeongKrw: number | null;
  /** 전월 대비 평균가 변동률(%) — 집계 테이블의 trend_delta_pct */
  deltaPct: number | null;
};

export type MonthlyReport = {
  ym: string;
  regionCount: number;
  txCount: number;
  /** 직전 월 총 거래량 (없으면 null) */
  prevTxCount: number | null;
  prevYm: string | null;
  rows: ReportRegionRow[];
  risers: ReportRegionRow[];
  fallers: ReportRegionRow[];
  /** 이번 달·직전 달은 신고 미완결 → 수치가 더 늘어날 수 있음 */
  isProvisional: boolean;
  /** 집계 갱신 시각(ISO) — Article dateModified 용 */
  updatedAt: string | null;
};

function currentYyyymm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevOf(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4));
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isValidYm(ym: string): boolean {
  return /^\d{6}$/.test(ym) && Number(ym.slice(4)) >= 1 && Number(ym.slice(4)) <= 12;
}

export function formatYmKo(ym: string): string {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4))}월`;
}

/** 리포트가 존재하는 월 목록 (최신순). */
export async function listReportMonths(): Promise<ReportMonthSummary[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("market_region_monthly")
    .select("month, transaction_count")
    .eq("deal_type", "trade")
    .eq("property_type", "apartment")
    .limit(5000);
  if (error || !data) return [];
  const byYm = new Map<string, ReportMonthSummary>();
  for (const r of data) {
    const ym = String(r.month ?? "");
    if (!isValidYm(ym)) continue;
    const cur = byYm.get(ym) ?? { ym, regionCount: 0, txCount: 0 };
    cur.regionCount += 1;
    cur.txCount += Number(r.transaction_count ?? 0);
    byYm.set(ym, cur);
  }
  return [...byYm.values()].sort((a, b) => b.ym.localeCompare(a.ym));
}

/** 특정 월 리포트. 데이터 없으면 null (없는 달의 리포트를 만들지 않는다). */
export async function getMonthlyReport(ym: string): Promise<MonthlyReport | null> {
  if (!isValidYm(ym)) return null;
  const sb = getServiceSupabase();
  if (!sb) return null;

  const prevYm = prevOf(ym);
  const { data, error } = await sb
    .from("market_region_monthly")
    .select("region_name, month, transaction_count, avg_deal_amount_krw, avg_price_per_pyeong_krw, trend_delta_pct, updated_at")
    .eq("deal_type", "trade")
    .eq("property_type", "apartment")
    .in("month", [ym, prevYm])
    .limit(2000);
  if (error || !data) return null;

  const rows: ReportRegionRow[] = [];
  let prevTx = 0;
  let hasPrev = false;
  let updatedAt: string | null = null;
  const seen = new Set<string>();

  for (const r of data) {
    const month = String(r.month ?? "");
    const name = String(r.region_name ?? "").trim();
    if (!name) continue;
    if (month === prevYm) {
      prevTx += Number(r.transaction_count ?? 0);
      hasPrev = true;
      continue;
    }
    if (month !== ym || seen.has(name)) continue;
    seen.add(name);
    rows.push({
      regionName: name,
      txCount: Number(r.transaction_count ?? 0),
      avgKrw: r.avg_deal_amount_krw === null ? null : Number(r.avg_deal_amount_krw),
      perPyeongKrw:
        r.avg_price_per_pyeong_krw === null ? null : Number(r.avg_price_per_pyeong_krw),
      deltaPct: r.trend_delta_pct === null ? null : Number(r.trend_delta_pct),
    });
    const u = r.updated_at ? String(r.updated_at) : null;
    if (u && (!updatedAt || u > updatedAt)) updatedAt = u;
  }
  if (rows.length === 0) return null;

  rows.sort((a, b) => b.txCount - a.txCount);
  const withDelta = rows.filter((r) => r.deltaPct !== null && r.txCount >= 10);
  const risers = [...withDelta].sort((a, b) => (b.deltaPct ?? 0) - (a.deltaPct ?? 0)).slice(0, 3)
    .filter((r) => (r.deltaPct ?? 0) > 0);
  const fallers = [...withDelta].sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0)).slice(0, 3)
    .filter((r) => (r.deltaPct ?? 0) < 0);

  const now = currentYyyymm();
  return {
    ym,
    regionCount: rows.length,
    txCount: rows.reduce((s, r) => s + r.txCount, 0),
    prevTxCount: hasPrev ? prevTx : null,
    prevYm: hasPrev ? prevYm : null,
    rows,
    risers,
    fallers,
    isProvisional: ym >= prevOf(now),
    updatedAt,
  };
}
