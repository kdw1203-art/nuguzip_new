import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { kstWeekStart } from "@/lib/market/temperature";
import { fetchCruxRecord, isCruxConfigured, type CruxFormFactor } from "@/lib/seo/crux";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * N5 — CrUX 실사용자 성능 주간 기록.
 *
 * 무엇을 하나: 사이트 전체(origin)의 실사용자 Core Web Vitals 를 기기별로 가져와
 * `seo_field_perf` 에 그 주의 행으로 upsert 한다. 키가 (그 주의 월요일, 대상, 기기)
 * 라서 여러 번 돌아도 그 주의 행 하나를 갱신할 뿐이다 — 저장된 값의 정의는
 * **"그 주에 마지막으로 관측한 CrUX 28일 집계"** 다.
 *
 * 표본 미달(404)은 실패가 아니다: status='insufficient_data' 로 **그대로 기록한다.**
 * 기록을 건너뛰면 나중에 "그 주에 데이터가 없었는지, 크론이 안 돌았는지"를 구분할
 * 수 없다. 수치 칸은 전부 null 로 둔다 — 0 으로 채우면 대시보드가 세상에서 가장
 * 빠른 사이트를 그린다.
 *
 * 주기: `.github/workflows/etl.yml` 의 alerts 잡이 **월요일 06:00 UTC(=15:00 KST) 무렵**
 *       에만 호출한다. CrUX 자체가 28일 롤링 집계라 더 자주 불러야 할 이유가 없다.
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 * fail-soft: 던지지 않고 JSON 요약을 돌려준다(ETL 을 죽이지 않는다).
 */

const ORIGIN = "https://nuguzip.com";
const FORM_FACTORS: readonly CruxFormFactor[] = ["PHONE", "DESKTOP", "ALL"];

export async function GET(req: Request) {
  if (!(await authorizeCron(req))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  /* 키가 없으면 아무것도 기록하지 않고 그렇다고 말한다. 없는 키로 호출해 놓고
     "성능 데이터 없음"을 기록하면 그건 관측이 아니라 지어낸 기록이다. */
  if (!isCruxConfigured()) {
    return NextResponse.json({
      ok: true,
      skipped: "no_key",
      detail: "CRUX_API_KEY 미설정 — 기록하지 않았습니다(값이 없는 것과 키가 없는 것은 다릅니다)",
    });
  }

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "service_supabase_unavailable" },
      { status: 503 },
    );
  }

  const week = kstWeekStart();
  const rows: Record<string, unknown>[] = [];
  const summary: Record<string, string> = {};

  for (const formFactor of FORM_FACTORS) {
    const outcome = await fetchCruxRecord({ origin: ORIGIN }, formFactor);
    summary[formFactor] = outcome.status;

    const base = {
      collected_week: week,
      target: "origin",
      form_factor: formFactor,
      observed_at: new Date().toISOString(),
    };

    if (outcome.status === "ok") {
      const m = outcome.metrics;
      rows.push({
        ...base,
        status: "ok",
        error_detail: null,
        lcp_p75_ms: m.lcpP75Ms,
        inp_p75_ms: m.inpP75Ms,
        fcp_p75_ms: m.fcpP75Ms,
        ttfb_p75_ms: m.ttfbP75Ms,
        cls_p75: m.clsP75,
        lcp_good_pct: m.lcpGoodPct,
        inp_good_pct: m.inpGoodPct,
        cls_good_pct: m.clsGoodPct,
        period_first_date: outcome.period.first || null,
        period_last_date: outcome.period.last || null,
      });
    } else if (outcome.status === "insufficient_data") {
      /* 수치 칸은 전부 비운다. "표본이 모자라 못 쟀다"가 이 행의 전부다. */
      rows.push({ ...base, status: "insufficient_data", error_detail: null });
    } else {
      rows.push({ ...base, status: "error", error_detail: outcome.detail.slice(0, 500) });
      logger.warn(`[crux-sync] ${formFactor} 조회 실패: ${outcome.detail}`);
    }
  }

  const { error } = await sb
    .from("seo_field_perf")
    .upsert(rows, { onConflict: "collected_week,target,form_factor" });

  if (error) {
    logger.error(`[crux-sync] 저장 실패: ${error.message}`);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, week, recorded: rows.length, summary });
}
