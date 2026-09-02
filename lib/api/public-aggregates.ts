import "server-only";

import { getReadOnlySupabase } from "@/lib/newui/supabase-read";

/**
 * N20 — 공개 집계 JSON API 의 데이터 레이어.
 *
 * ── 공개 범위 (기본값 — 소유자가 바꿀 수 있다) ─────────────────────────────
 * 기획 문서 N20 행에 "공개 범위는 소유자 결정"이라고 적혀 있다. 소유자 판단이
 * 오기 전까지는 **이미 사이트에 그대로 렌더되고 있는 것만** 연다. 구체적으로:
 *
 *   여는 것 : public.market_region_monthly 의 아파트 매매(trade/apartment) 월간
 *            지역 집계 — 거래 건수, 평균 거래가, 평당가, 전월 대비 변동률.
 *            이 값들은 /reports/[ym] 과 /analysis/timing 에 숫자 그대로 찍힌다.
 *   안 여는 것 : 개별 실거래 행(단지·동·층·계약일 단위), 전월세 집계, 사용자
 *            데이터(임장노트·회원·모임), 내부 운영 지표. 화면에 안 나오는 것을
 *            API 로 먼저 열지 않는다.
 *
 * 범위를 넓히려면 이 파일의 SELECT 와 필터를 바꾸는 것으로 충분하다 —
 * 라우트는 여기서 만든 모양을 그대로 내보낸다.
 *
 * ── 실패를 빈 배열로 바꾸지 않는다 ─────────────────────────────────────────
 * 이 서비스가 반복해서 밟은 지뢰다(lib/market/tx-bands.ts 헤더 참고). API 는
 * 사람이 눈으로 걸러 주지도 않으므로 더 위험하다 — 조회 실패를 `{"rows":[]}`
 * 로 돌려주면 그걸 받아 간 쪽이 "그 달에 거래가 없었다"고 인용한다. 그래서
 * 읽기는 던지고, 라우트가 503 으로 바꾼다.
 */

/** API 응답에 항상 실리는 출처·이용 조건. 값 자체가 계약이라 한 곳에만 둔다. */
export const PUBLIC_API_LICENSE = {
  /** 인용 시 표기할 이름 */
  attribution: "내집나우(naezipnow.com)",
  attributionUrl: "https://naezipnow.com",
  /** 원자료 출처 — 우리가 만든 숫자가 아니다 */
  sources: [
    {
      name: "국토교통부 실거래가 공개시스템",
      url: "https://rt.molit.go.kr",
      note: "아파트 매매 신고 자료. 계약일 기준 30일 이내 신고 의무가 있어 최근 1~2개월 값은 이후 늘어납니다.",
    },
  ],
  terms: "https://naezipnow.com/developers",
  /** 집계 정의·계산식 */
  methodology: "https://naezipnow.com/methodology",
} as const;

export type PublicApiLicense = typeof PUBLIC_API_LICENSE;

export type RegionMonthlyRow = {
  /** 법정동 코드 앞 5자리 (시군구) */
  regionCode: string;
  /** 국토교통부 신고 자료 표기 그대로 */
  regionName: string;
  /** yyyymm */
  month: string;
  transactionCount: number;
  avgDealAmountKrw: number | null;
  avgPricePerPyeongKrw: number | null;
  /** 전월 대비 평균 거래가 변동률(%) */
  trendDeltaPct: number | null;
  /** 이 행이 마지막으로 갱신된 시각(ISO) */
  updatedAt: string | null;
};

export type MonthSummary = {
  month: string;
  regionCount: number;
  transactionCount: number;
  updatedAt: string | null;
};

const SELECT =
  "region_code, region_name, month, transaction_count, avg_deal_amount_krw, " +
  "avg_price_per_pyeong_krw, trend_delta_pct, updated_at";

/** 공개 범위 필터 — 한 곳에서만 정의한다(라우트가 우회할 수 없게). */
const SCOPE = { deal_type: "trade", property_type: "apartment" } as const;

function client() {
  const sb = getReadOnlySupabase();
  if (!sb) {
    throw new Error(
      "Supabase 읽기 키가 없어 공개 집계를 조회할 수 없습니다 " +
        "(SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  }
  return sb;
}

type Raw = {
  region_code: string | null;
  region_name: string | null;
  month: string | null;
  transaction_count: number | null;
  avg_deal_amount_krw: number | null;
  avg_price_per_pyeong_krw: number | null;
  trend_delta_pct: number | null;
  updated_at: string | null;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRow(r: Raw): RegionMonthlyRow | null {
  const month = String(r.month ?? "");
  if (!isValidMonth(month) || !r.region_name) return null;
  return {
    regionCode: String(r.region_code ?? ""),
    regionName: r.region_name,
    month,
    transactionCount: Number(r.transaction_count ?? 0),
    avgDealAmountKrw: num(r.avg_deal_amount_krw),
    avgPricePerPyeongKrw: num(r.avg_price_per_pyeong_krw),
    trendDeltaPct: num(r.trend_delta_pct),
    updatedAt: r.updated_at ? String(r.updated_at) : null,
  };
}

export function isValidMonth(month: string): boolean {
  if (!/^\d{6}$/.test(month)) return false;
  const m = Number(month.slice(4));
  return m >= 1 && m <= 12;
}

/** 응답 상한 — 한 번에 전국을 다 받아도 남는 여유를 두되, 무한 페이지는 막는다. */
export const MAX_LIMIT = 500;
export const DEFAULT_LIMIT = 100;

export type RegionMonthlyQuery = {
  /** yyyymm — 없으면 전체 월 */
  month?: string;
  /** 지역명 부분 일치 (예: "강남") */
  region?: string;
  limit: number;
  offset: number;
};

export async function listRegionMonthly(
  q: RegionMonthlyQuery,
): Promise<{ rows: RegionMonthlyRow[]; total: number }> {
  let query = client()
    .from("market_region_monthly")
    .select(SELECT, { count: "exact" })
    .eq("deal_type", SCOPE.deal_type)
    .eq("property_type", SCOPE.property_type);

  if (q.month) query = query.eq("month", q.month);
  /* 부분 일치는 ilike 로 받는다. `%` 와 `_` 는 호출자가 넣어도 의미가 없도록
     라우트에서 이미 걸러 두지만, 여기서도 이스케이프해 이중으로 막는다. */
  if (q.region) query = query.ilike("region_name", `%${escapeLike(q.region)}%`);

  const { data, error, count } = await query
    .order("month", { ascending: false })
    .order("transaction_count", { ascending: false })
    .order("region_name", { ascending: true })
    .range(q.offset, q.offset + q.limit - 1);

  if (error) {
    throw new Error(
      `market_region_monthly 조회 실패 — ${error.message}${error.code ? ` [${error.code}]` : ""}`,
    );
  }

  const rows: RegionMonthlyRow[] = [];
  /* SELECT 가 문자열 리터럴이 아니라 상수 결합이라 PostgREST 의 타입 추론이
     GenericStringError[] 로 무너진다(레포 다른 곳과 같은 우회). unknown 경유 캐스팅. */
  for (const raw of (data ?? []) as unknown as Raw[]) {
    const row = toRow(raw);
    if (row) rows.push(row);
  }
  return { rows, total: count ?? rows.length };
}

function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** 집계가 존재하는 월 목록 (최신순) — API 이용자가 먼저 부르는 인덱스. */
export async function listAvailableMonths(): Promise<MonthSummary[]> {
  /* PostgREST 는 GROUP BY 를 못 하므로 집계는 JS 에서 한다. 행이 지역×월이라
     (62 × 월수) 규모다 — 전국으로 늘어도 수천 행이라 한 번에 읽고 접어도 된다. */
  const { data, error } = await client()
    .from("market_region_monthly")
    .select("month, transaction_count, updated_at")
    .eq("deal_type", SCOPE.deal_type)
    .eq("property_type", SCOPE.property_type)
    .limit(20_000);

  if (error) {
    throw new Error(
      `market_region_monthly 월 목록 조회 실패 — ${error.message}` +
        `${error.code ? ` [${error.code}]` : ""}`,
    );
  }

  const byMonth = new Map<string, MonthSummary>();
  for (const r of data ?? []) {
    const month = String(r.month ?? "");
    if (!isValidMonth(month)) continue;
    const cur =
      byMonth.get(month) ?? { month, regionCount: 0, transactionCount: 0, updatedAt: null };
    cur.regionCount += 1;
    cur.transactionCount += Number(r.transaction_count ?? 0);
    const u = r.updated_at ? String(r.updated_at) : null;
    if (u && (!cur.updatedAt || u > cur.updatedAt)) cur.updatedAt = u;
    byMonth.set(month, cur);
  }
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/**
 * 신고 지연 때문에 아직 확정이 아닌 월인가.
 *
 * 계약 후 30일 이내 신고이므로 이번 달과 직전 달은 계속 늘어난다. 이 사실을
 * 응답에 `provisional: true` 로 실어야, 받아 간 쪽이 "거래가 급감했다"고
 * 잘못 읽지 않는다. (화면에서는 /reports 가 같은 규칙으로 표시한다.)
 */
export function isProvisionalMonth(month: string, now = new Date()): boolean {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const cur = `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 1, 1));
  const prev = `${prevDate.getUTCFullYear()}${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;
  return month === cur || month === prev;
}
