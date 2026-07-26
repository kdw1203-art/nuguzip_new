/**
 * S11/G7 — 월간 실거래 리포트 데이터 레이어.
 *
 * market_region_monthly(실거래 집계 테이블)에서 읽기만 한다 — 사람이 쓰는 글이
 * 아니라 데이터 요약이므로, 여기 없는 수치는 리포트에도 없다. 신고 지연
 * (계약 후 30일)이 있는 최근 월은 isProvisional 로 표시해 화면이 명기하게 한다.
 *
 * ── 2026-07-26: 두 가지를 고쳤다 ────────────────────────────────────────────
 * 1) getServiceSupabase() → getReadOnlySupabase()
 *    /reports 는 프리렌더(revalidate 1시간) 라우트인데, 빌드가 도는 CI 러너에는
 *    서비스 롤 키가 없었다. 그래서 sb === null → `return []` → "아직 리포트가
 *    없습니다" 가 HTML 에 굳어 배포됐다. 같은 데이터를 읽는 런타임 라우트
 *    /sitemap-reports.xml 은 202605·202606·202607 세 달을 정상으로 돌려주고
 *    있었으니, 데이터가 없던 게 아니라 빌드가 못 읽었던 것이다.
 *    market_region_monthly 는 공개 읽기 정책이 있는 평범한 테이블이라 anon 으로도
 *    읽힌다(실측: anon 으로 101행 · 3개월). 그래서 서비스 롤이 있으면 그대로 쓰고
 *    없을 때만 anon 으로 떨어지는 클라이언트로 바꾼다. 런타임 동작은 그대로다.
 *
 * 2) 조회 실패를 빈 값으로 바꾸지 않는다
 *    `if (error || !data) return []` 은 "그 달 리포트가 없다" 와 "DB 를 못 읽었다"
 *    를 같은 모양으로 만든다. 실제로 같은 패턴이 /tx 에서 42501 권한 오류를
 *    하루 동안 "데이터 없음" 으로 위장했다(lib/market/tx-bands.ts 헤더 참고).
 *    이제 실패는 던지고, 부르는 쪽이 둘을 구분해서 화면에 적는다.
 *    "없는 달의 리포트를 만들지 않는다" 는 원칙은 그대로다 — 조회가 **성공했는데**
 *    행이 없을 때만 null 이다.
 */
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";

export type ReportMonthSummary = {
  /** yyyymm */
  ym: string;
  regionCount: number;
  txCount: number;
  /** 그 달 집계가 마지막으로 갱신된 시각(ISO) — RSS pubDate 등에 쓰는 실측 날짜 */
  updatedAt: string | null;
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
  const sb = getReadOnlySupabase();
  if (!sb) {
    throw new Error(
      "market_region_monthly 를 읽을 수단이 없습니다 — SUPABASE_SERVICE_ROLE_KEY 도 " +
        "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY 도 설정되지 않았습니다.",
    );
  }
  const { data, error } = await sb
    .from("market_region_monthly")
    .select("month, transaction_count, updated_at")
    .eq("deal_type", "trade")
    .eq("property_type", "apartment")
    .limit(5000);
  if (error) {
    throw new Error(
      `market_region_monthly 조회 실패 (월 목록) — ${error.message}` +
        `${error.code ? ` [${error.code}]` : ""}` +
        `${error.hint ? ` · 힌트: ${error.hint}` : ""}`,
    );
  }
  if (!data) return [];
  const byYm = new Map<string, ReportMonthSummary>();
  for (const r of data) {
    const ym = String(r.month ?? "");
    if (!isValidYm(ym)) continue;
    const cur = byYm.get(ym) ?? { ym, regionCount: 0, txCount: 0, updatedAt: null };
    cur.regionCount += 1;
    cur.txCount += Number(r.transaction_count ?? 0);
    // 그 달 행들 중 가장 나중 갱신 시각 — 없으면 null 로 둔다(날짜를 지어내지 않는다).
    const u = r.updated_at ? String(r.updated_at) : null;
    if (u && (!cur.updatedAt || u > cur.updatedAt)) cur.updatedAt = u;
    byYm.set(ym, cur);
  }
  return [...byYm.values()].sort((a, b) => b.ym.localeCompare(a.ym));
}

/** 특정 월 리포트. 데이터 없으면 null (없는 달의 리포트를 만들지 않는다). */
export async function getMonthlyReport(ym: string): Promise<MonthlyReport | null> {
  if (!isValidYm(ym)) return null;
  const sb = getReadOnlySupabase();
  if (!sb) {
    throw new Error(
      "market_region_monthly 를 읽을 수단이 없습니다 — SUPABASE_SERVICE_ROLE_KEY 도 " +
        "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY 도 설정되지 않았습니다.",
    );
  }

  const prevYm = prevOf(ym);
  const { data, error } = await sb
    .from("market_region_monthly")
    .select("region_name, month, transaction_count, avg_deal_amount_krw, avg_price_per_pyeong_krw, trend_delta_pct, updated_at")
    .eq("deal_type", "trade")
    .eq("property_type", "apartment")
    .in("month", [ym, prevYm])
    .limit(2000);
  if (error) {
    throw new Error(
      `market_region_monthly 조회 실패 (${ym}) — ${error.message}` +
        `${error.code ? ` [${error.code}]` : ""}` +
        `${error.hint ? ` · 힌트: ${error.hint}` : ""}`,
    );
  }
  if (!data) return null;

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
