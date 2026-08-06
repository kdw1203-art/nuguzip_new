-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260805015908,
-- name = market_aggregates_budget_guard_and_health.
-- 아래 본문은 그 원장의 statements 원문 그대로다. 내가 새로 쓴 문장은 이 머리말뿐이고
-- SQL 은 한 글자도 손대지 않았다. 이 파일이 적용 시점에 쓰였다는 뜻이 아니다.
--
-- 왜 비어 있었나: 이전 세션이 MCP apply_migration 으로 적용하고 파일 미러링을 빠뜨렸다.
-- 20260804234917 ~ 20260805225415 구간 11건을 2026-08-06 에 한꺼번에 복원했다.
-- 이 11건이 전부라는 뜻은 아니다. 같은 날 원장을 전수로 세어 본 결과는 이렇다 —
-- 기준선(20260724212021) 이후 원장 160행 대 파일 79개, 원장이 만들고 지금도 DB 에
-- 남아 있는 객체 238개 중 78개는 저장소 어디에도 정의가 없다. "11건" 은 눈에 띈
-- 최근 구간이었을 뿐이고, 센 결과가 아니었다.
-- 남은 결손은 supabase/ledger-snapshot.json 의 known_unmirrored 에 근거(원장 version)와
-- 함께 적어 두었고, scripts/check-migration-ledger.mjs 가 릴리스 게이트에서 다시 센다.
--
-- 되돌리기: 이 파일은 기존 함수/뷰를 CREATE OR REPLACE 로 덮는다. 되돌리려면 직전
--           정의(20260804 이전 market_aggregates 계열 마이그레이션)를 다시 적용해야
--           하고, reporting.market_aggregates_health 는 이 마이그레이션에서 처음
--           생겼으므로 `drop view reporting.market_aggregates_health;` 로 지운다.

-- 2026-08-05
-- 배경: /api/cron/market-aggregates-refresh (HTTP, statement_timeout 280s) 가
-- 8/3~8/4 사이 3연속 500 으로 죽었다. 집계는 230초가 걸리고, 취소되면 예외 핸들러의
-- INSERT 까지 트랜잭션과 함께 롤백돼 etl_runs 에 아무 흔적도 남지 않는다.
-- → 예산이 모자란 호출자는 아예 시작하지 않게 하고, 실제 작업은 pg_cron(900s)에 맡긴다.

CREATE OR REPLACE FUNCTION public.refresh_market_aggregates()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  fresh_within  constant interval := interval '6 hours';
  -- 최근 실측 230초. 여유를 두고 600초 미만 예산이면 손대지 않는다.
  min_budget_ms constant integer  := 600000;
  lock_key  bigint      := hashtext('refresh_market_aggregates')::bigint;
  t0        timestamptz := clock_timestamp();
  last_ok   timestamptz;
  res       jsonb;
  budget_ms integer;
BEGIN
  -- 예산 가드. 여기서 빠지는 호출은 실패가 아니라 "내 일이 아님"이다.
  SELECT setting::int INTO budget_ms FROM pg_settings WHERE name = 'statement_timeout';

  IF coalesce(budget_ms, 0) > 0 AND budget_ms < min_budget_ms THEN
    -- 시간당 1행만. pipeline_health 의 market-aggregates 줄을 오염시키지 않도록 source 를 분리한다.
    INSERT INTO public.etl_runs (run_key, source, scope, status,
                                 started_at, finished_at, params)
    VALUES ('market-agg-deferred-' || to_char(t0, 'YYYYMMDD-HH24'),
            'market-aggregates-http', 'deferred', 'deferred',
            t0, clock_timestamp(),
            jsonb_build_object('reason', 'insufficient statement_timeout',
                               'budget_ms', budget_ms,
                               'required_ms', min_budget_ms))
    ON CONFLICT (run_key) DO NOTHING;

    RETURN jsonb_build_object(
      'ok', true, 'skipped', true,
      'reason', 'insufficient statement_timeout budget',
      'budget_ms', budget_ms, 'required_ms', min_budget_ms,
      'handled_by', 'pg_cron:market-aggregates-daily');
  END IF;

  SELECT max(finished_at) INTO last_ok
  FROM public.etl_runs
  WHERE source = 'market-aggregates' AND status = 'completed';

  IF last_ok IS NOT NULL AND last_ok > now() - fresh_within THEN
    RETURN jsonb_build_object(
      'ok', true, 'skipped', true, 'reason', 'refreshed recently',
      'last_refreshed_at', last_ok,
      'next_eligible_at', last_ok + fresh_within);
  END IF;

  IF NOT pg_try_advisory_lock(lock_key) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'already running');
  END IF;

  BEGIN
    res := coalesce(public.refresh_market_aggregates_impl(), '{}'::jsonb);

    REFRESH MATERIALIZED VIEW CONCURRENTLY market_agg.complex_households_resolved;
    REFRESH MATERIALIZED VIEW CONCURRENTLY market_agg.map_facet_source;

    res := res || jsonb_build_object(
      'households_resolved', (SELECT count(*) FROM market_agg.complex_households_resolved),
      'map_facet_source',    (SELECT count(*) FROM market_agg.map_facet_source));
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(lock_key);
    -- 여기서 etl_runs 에 'failed' 를 넣어봐야 아래 RAISE 와 함께 롤백된다(예전 코드의 착각).
    -- 실패 기록은 cron.job_run_details 가 남기고, reporting.market_aggregates_health 가 합쳐서 보여준다.
    RAISE;
  END;

  PERFORM pg_advisory_unlock(lock_key);

  INSERT INTO public.etl_runs (run_key, source, scope, status, started_at, finished_at,
                               inserted_count, error_count, error_log, params)
  VALUES ('market-agg-' || to_char(t0,'YYYYMMDD-HH24MISS'),
          'market-aggregates', 'guarded', 'completed', t0, clock_timestamp(),
          0, 0, '[]'::jsonb, res);

  RETURN res || jsonb_build_object(
    'duration_ms', round(extract(epoch FROM (clock_timestamp() - t0)) * 1000)::int);
END;
$function$;

-- 한 곳에서 진실을 보기 위한 뷰: 집계 테이블 실제 신선도 + 마지막 성공 + pg_cron 실패까지.
CREATE OR REPLACE VIEW reporting.market_aggregates_health AS
SELECT
  (SELECT max(updated_at) FROM public.market_region_monthly)                        AS region_monthly_updated_at,
  round(extract(epoch FROM now() - (SELECT max(updated_at)
        FROM public.market_region_monthly)) / 3600.0, 1)                            AS region_monthly_age_hours,
  (SELECT max(finished_at) FROM public.etl_runs
    WHERE source = 'market-aggregates' AND status = 'completed')                    AS last_ok,
  (SELECT round(extract(epoch FROM (finished_at - started_at)))::int
     FROM public.etl_runs
    WHERE source = 'market-aggregates' AND status = 'completed'
    ORDER BY started_at DESC LIMIT 1)                                               AS last_duration_sec,
  (SELECT max(started_at) FROM public.etl_runs
    WHERE source = 'market-aggregates-http')                                        AS last_http_deferred_at,
  (SELECT count(*)::int FROM cron.job_run_details d
     JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'market-aggregates-daily'
      AND d.status <> 'succeeded'
      AND d.start_time > now() - interval '7 days')                                 AS cron_failures_7d,
  (SELECT d.start_time FROM cron.job_run_details d
     JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'market-aggregates-daily'
    ORDER BY d.start_time DESC LIMIT 1)                                             AS last_cron_run_at;

COMMENT ON VIEW reporting.market_aggregates_health IS
  '시황 집계 파이프라인 단일 확인 지점. etl_runs 만 보면 statement_timeout 실패가 안 보인다.';
