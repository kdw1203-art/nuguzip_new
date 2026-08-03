-- [미러] 소유자가 원격(MCP)으로 적용한 마이그레이션의 저장소 반영본.
-- 적용 시각 = 파일명 버전(20260803225657). 내용 무수정 원문.
-- 배경: 스모크 테스트에서 pg_cron 세션 statement_timeout 120초가
-- 8번째 MV(complex_tx_stats_base) 갱신을 잘랐다 — Market ETL 1회 실패의 원인.
-- 롤백: 이전 함수 정의로 CREATE OR REPLACE (statement_timeout 설정 제거).

-- 스모크 테스트에서 잡힌 것: pg_cron 세션의 statement_timeout 이 120초라
-- 8번째 MV(public.complex_tx_stats_base) 갱신 중 잘렸다.
-- 안쪽 함수의 SET 280s 만으로는 부족해서 바깥 함수에도 명시한다.
CREATE OR REPLACE FUNCTION public.refresh_market_aggregates_cron()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET statement_timeout TO '900s'
SET lock_timeout TO '60s'
SET idle_in_transaction_session_timeout TO '0'
AS $$
DECLARE
  lock_key bigint := hashtext('refresh_market_aggregates')::bigint;
  t0 timestamptz := clock_timestamp();
  res jsonb;
BEGIN
  IF NOT pg_try_advisory_lock(lock_key) THEN
    RETURN jsonb_build_object('ok', false, 'skipped', true,
                              'reason', 'already running', 'at', now());
  END IF;

  BEGIN
    res := coalesce(public.refresh_market_aggregates(), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(lock_key);
    INSERT INTO public.etl_runs (run_key, source, scope, status, started_at, finished_at,
                                 error_count, error_log, params)
    VALUES ('market-agg-' || to_char(now(),'YYYYMMDD-HH24MISS'),
            'market-aggregates', 'pg_cron', 'failed', t0, now(), 1,
            jsonb_build_object('message', SQLERRM, 'sqlstate', SQLSTATE), '{}'::jsonb);
    RAISE;
  END;

  PERFORM pg_advisory_unlock(lock_key);

  INSERT INTO public.etl_runs (run_key, source, scope, status, started_at, finished_at,
                               inserted_count, error_count, error_log, params)
  VALUES ('market-agg-' || to_char(now(),'YYYYMMDD-HH24MISS'),
          'market-aggregates', 'pg_cron', 'completed', t0, now(),
          0, 0, '[]'::jsonb, res);

  RETURN res || jsonb_build_object(
    'duration_ms', round(extract(epoch FROM (clock_timestamp() - t0)) * 1000)::int);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_market_aggregates_cron() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('market-agg-smoketest');
SELECT cron.schedule('market-agg-smoketest', '0 23 * * *',
                     $cron$SELECT public.refresh_market_aggregates_cron();$cron$);
