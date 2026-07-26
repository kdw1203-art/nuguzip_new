import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { isCruxConfigured } from "@/lib/seo/crux";
import { isGscConfigured } from "@/lib/seo/gsc-index";

/**
 * /admin/seo 가 읽는 두 개의 주간 기록 (N5 CrUX · N25 색인률).
 *
 * ── 세 가지 상태를 구분한다 ──────────────────────────────────────────────
 *   1) 키가 없다        → 아직 켜지 않은 기능. 화면은 "설정하면 켜집니다"라고 말한다.
 *   2) 키는 있는데 행이 없다 → 크론이 아직 안 돌았거나 표본 미달. 그렇다고 말한다.
 *   3) 조회가 실패했다   → "데이터 없음"이 아니라 "못 읽었다"고 말한다.
 * 이 셋을 한 문장으로 뭉개면 대시보드를 보고 잘못된 판단을 하게 된다 — 특히
 * 1번과 2번을 섞으면 "키를 넣었는데 왜 안 되지"에 답할 수 없다.
 */

export interface FieldPerfRow {
  collectedWeek: string;
  formFactor: string;
  status: "ok" | "insufficient_data" | "error";
  errorDetail: string | null;
  lcpP75Ms: number | null;
  inpP75Ms: number | null;
  fcpP75Ms: number | null;
  ttfbP75Ms: number | null;
  clsP75: number | null;
  lcpGoodPct: number | null;
  inpGoodPct: number | null;
  clsGoodPct: number | null;
  periodFirstDate: string | null;
  periodLastDate: string | null;
}

export interface IndexCoverageRow {
  collectedWeek: string;
  submitted: number;
  sampled: number;
  indexed: number;
  notIndexed: number;
  errored: number;
  bySection: Record<string, { submitted: number; sampled: number; indexed: number }>;
  coverageStates: Record<string, number>;
}

export type Loaded<T> =
  | { state: "ok"; rows: T[] }
  /** 키 미설정 — 기능이 꺼져 있는 정상 상태다. */
  | { state: "not_configured" }
  /** 조회 실패 — "없음"이 아니다. */
  | { state: "failed"; detail: string };

const PERF_SELECT =
  "collected_week, form_factor, status, error_detail, lcp_p75_ms, inp_p75_ms, fcp_p75_ms, ttfb_p75_ms, cls_p75, lcp_good_pct, inp_good_pct, cls_good_pct, period_first_date, period_last_date";

interface RawPerf {
  collected_week: string;
  form_factor: string;
  status: string;
  error_detail: string | null;
  lcp_p75_ms: number | null;
  inp_p75_ms: number | null;
  fcp_p75_ms: number | null;
  ttfb_p75_ms: number | null;
  cls_p75: number | string | null;
  lcp_good_pct: number | string | null;
  inp_good_pct: number | string | null;
  cls_good_pct: number | string | null;
  period_first_date: string | null;
  period_last_date: string | null;
}

/** numeric 컬럼은 PostgREST 가 문자열로 준다 — 화면에서 toFixed 하기 전에 숫자로 돌린다. */
function n(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadFieldPerf(weeks = 8): Promise<Loaded<FieldPerfRow>> {
  if (!isCruxConfigured()) return { state: "not_configured" };
  const sb = getServiceSupabase();
  if (!sb) return { state: "failed", detail: "서비스 키가 없어 조회하지 못했습니다" };

  const { data, error } = await sb
    .from("seo_field_perf")
    .select(PERF_SELECT)
    .eq("target", "origin")
    .order("collected_week", { ascending: false })
    .limit(weeks * 3);

  if (error) return { state: "failed", detail: error.message };

  const rows = (data as unknown as RawPerf[]).map((r) => ({
    collectedWeek: r.collected_week,
    formFactor: r.form_factor,
    status: (r.status === "ok" || r.status === "insufficient_data" ? r.status : "error") as
      | "ok"
      | "insufficient_data"
      | "error",
    errorDetail: r.error_detail,
    lcpP75Ms: r.lcp_p75_ms,
    inpP75Ms: r.inp_p75_ms,
    fcpP75Ms: r.fcp_p75_ms,
    ttfbP75Ms: r.ttfb_p75_ms,
    clsP75: n(r.cls_p75),
    lcpGoodPct: n(r.lcp_good_pct),
    inpGoodPct: n(r.inp_good_pct),
    clsGoodPct: n(r.cls_good_pct),
    periodFirstDate: r.period_first_date,
    periodLastDate: r.period_last_date,
  }));

  return { state: "ok", rows };
}

const COVERAGE_SELECT =
  "collected_week, submitted, sampled, indexed, not_indexed, errored, by_section, coverage_states";

interface RawCoverage {
  collected_week: string;
  submitted: number;
  sampled: number;
  indexed: number;
  not_indexed: number;
  errored: number;
  by_section: Record<string, { submitted: number; sampled: number; indexed: number }> | null;
  coverage_states: Record<string, number> | null;
}

export async function loadIndexCoverage(weeks = 8): Promise<Loaded<IndexCoverageRow>> {
  if (!isGscConfigured()) return { state: "not_configured" };
  const sb = getServiceSupabase();
  if (!sb) return { state: "failed", detail: "서비스 키가 없어 조회하지 못했습니다" };

  const { data, error } = await sb
    .from("seo_index_coverage")
    .select(COVERAGE_SELECT)
    .order("collected_week", { ascending: false })
    .limit(weeks);

  if (error) return { state: "failed", detail: error.message };

  const rows = (data as unknown as RawCoverage[]).map((r) => ({
    collectedWeek: r.collected_week,
    submitted: r.submitted,
    sampled: r.sampled,
    indexed: r.indexed,
    notIndexed: r.not_indexed,
    errored: r.errored,
    bySection: r.by_section ?? {},
    coverageStates: r.coverage_states ?? {},
  }));

  return { state: "ok", rows };
}
