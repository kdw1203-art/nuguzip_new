import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { kstWeekStart } from "@/lib/market/temperature";
import { DEFAULT_SAMPLE_SIZE, isGscConfigured, measureIndexCoverage } from "@/lib/seo/gsc-index";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * N25 — 색인률 주간 기록.
 *
 * 무엇을 하나: 우리 사이트맵 유형별로 표본 URL 을 뽑아 서치콘솔 URL 검사 API 로
 * 실제 색인 여부를 확인하고 `seo_index_coverage` 에 그 주의 행으로 upsert 한다.
 *
 * **표본이다.** 전수 검사는 할당량(2,000/일)상 사흘이 걸리고 그렇게 얻은 값은 이미
 * 사흘 전 상태다. 그래서 표본 수(sampled)를 반드시 같이 저장하고 화면에도 그대로
 * 띄운다 — 분모 없는 비율은 숫자가 아니라 인상이다.
 *
 * 분모(submitted)는 서치콘솔이 아니라 우리 사이트맵 생성기가 센 값이다. 우리 값이
 * 지금 이 순간 기준이고, 서치콘솔의 제출 수는 마지막 크롤 시점에 묶여 있다.
 *
 * 주기: `.github/workflows/etl.yml` 의 alerts 잡이 **월요일 09:00 UTC(=18:00 KST)**
 *       에만 호출한다. 색인 상태는 주 단위로 움직이는 값이라 그 이상은 소음이다.
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 * ?sample=N 으로 표본 수 조절(기본 60, 상한 300).
 * fail-soft: 던지지 않고 JSON 요약을 돌려준다.
 */

export async function GET(req: Request) {
  if (!(await authorizeCron(req))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  /* 키가 없으면 기록하지 않고 그렇다고 말한다 — 0% 로 적어 두면 다음 주에
     "색인률이 0에서 올랐다"는 없는 개선이 생긴다. */
  if (!isGscConfigured()) {
    return NextResponse.json({
      ok: true,
      skipped: "no_key",
      detail:
        "GSC 서비스 계정(GSC_SERVICE_ACCOUNT_EMAIL / _PRIVATE_KEY / GSC_SITE_URL) 미설정 — 기록하지 않았습니다",
    });
  }

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "service_supabase_unavailable" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const rawSample = Number.parseInt(url.searchParams.get("sample") ?? "", 10);
  const sampleSize = Number.isFinite(rawSample)
    ? Math.max(10, Math.min(300, rawSample))
    : DEFAULT_SAMPLE_SIZE;

  let result;
  try {
    result = await measureIndexCoverage(sampleSize);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    logger.error(`[gsc-index-sync] 측정 실패: ${detail}`);
    /* 반쪽짜리 표본을 정상 기록으로 남기지 않는다. 그 주는 비는 게 맞고,
       비어 있다는 사실이 화면에 그대로 드러난다. */
    return NextResponse.json({ ok: false, error: detail }, { status: 502 });
  }

  const week = kstWeekStart();
  const { error } = await sb.from("seo_index_coverage").upsert(
    {
      collected_week: week,
      submitted: result.submitted,
      sampled: result.sampled,
      indexed: result.indexed,
      not_indexed: result.notIndexed,
      errored: result.errored,
      by_section: result.bySection,
      coverage_states: result.coverageStates,
      observed_at: new Date().toISOString(),
    },
    { onConflict: "collected_week" },
  );

  if (error) {
    logger.error(`[gsc-index-sync] 저장 실패: ${error.message}`);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    week,
    submitted: result.submitted,
    sampled: result.sampled,
    indexed: result.indexed,
    errored: result.errored,
  });
}
