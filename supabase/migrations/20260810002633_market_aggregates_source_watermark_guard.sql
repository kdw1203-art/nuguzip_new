-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260810002633,
-- name = market_aggregates_source_watermark_guard.
-- 아래 본문은 그 원장의 statements 원문 그대로다(md5 e7a3dd74272f27aa6c77a5a26c4a09a0 · 4999b —
-- 원장 md5 와 바이트 단위 대조 완료). 내가 새로 쓴 문장은 이 머리말뿐이고
-- SQL 은 한 글자도 손대지 않았다. 이 파일이 적용 시점에 쓰였다는 뜻이 아니다.
--
-- 왜 비어 있었나: 2026-08-10 병렬 세션(소유자 승인 ops 작업)이 MCP 로 적용하고
-- 파일 미러링을 남기지 않았다. 같은 날 6건(20260810001136~20260810004552)을
-- 2026-08-11 에 한꺼번에 복원했다.
--
-- 되돌리기: 직전 정의의 refresh_market_aggregates() 재적용 필요 — 직전 정의는 원장 밖(known_unmirrored 참조)일 수 있다.

CREATE OR REPLACE FUNCTION public.refresh_market_aggregates()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  fresh_within  constant interval := interval '6 hours';
  -- 원천이 그대로여도 이 시간이 지나면 무조건 한 번은 다시 돈다(드리프트 안전판).
  max_stale     constant interval := interval '25 hours';
  min_budget_ms constant integer  := 600000;
  lock_key  bigint      := hashtext('refresh_market_aggregates')::bigint;
  t0        timestamptz := clock_timestamp();
  last_ok   timestamptz;
  res       jsonb;
  budget_ms integer;
  src_wm    timestamptz;
  last_wm   timestamptz;
BEGIN
  -- 예산 가드. 여기서 빠지는 호출은 실패가 아니라 "내 일이 아님"이다.
  SELECT setting::int INTO budget_ms FROM pg_settings WHERE name = 'statement_timeout';

  IF coalesce(budget_ms, 0) > 0 AND budget_ms < min_budget_ms THEN
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

  /* 2026-08-10 추가 — 원천 변화 가드.
     집계 입력은 market_transactions(신규/정정)과 apartment_complexes 다.
     둘 다 직전 성공 이후로 한 톨도 안 움직였으면 결과가 비트 단위로 같다.
     그걸 230초 들여 다시 만드는 건 순수 낭비였다(측정: DB 전체 실행시간의 35.9%).
     세 컬럼 모두 인덱스가 있어 이 워터마크 조회 자체는 1.3ms 다.
     단, max_stale 이 지나면 원천이 그대로여도 한 번은 돌린다. */
  SELECT greatest(
           (SELECT max(created_at) FROM public.market_transactions),
           (SELECT max(updated_at) FROM public.market_transactions),
           (SELECT max(updated_at) FROM public.apartment_complexes))
    INTO src_wm;

  SELECT (params->>'source_watermark')::timestamptz INTO last_wm
  FROM public.etl_runs
  WHERE source = 'market-aggregates' AND status = 'completed'
    AND params ? 'source_watermark'
  ORDER BY finished_at DESC
  LIMIT 1;

  IF last_wm IS NOT NULL
     AND src_wm IS NOT NULL
     AND src_wm <= last_wm
     AND last_ok IS NOT NULL
     AND last_ok > now() - max_stale THEN

    INSERT INTO public.etl_runs (run_key, source, scope, status,
                                 started_at, finished_at, params)
    VALUES ('market-agg-nochange-' || to_char(t0, 'YYYYMMDD-HH24'),
            'market-aggregates', 'nochange', 'skipped',
            t0, clock_timestamp(),
            jsonb_build_object('reason', 'source unchanged',
                               'source_watermark', src_wm,
                               'last_watermark', last_wm,
                               'last_ok', last_ok))
    ON CONFLICT (run_key) DO NOTHING;

    RETURN jsonb_build_object(
      'ok', true, 'skipped', true, 'reason', 'source unchanged',
      'source_watermark', src_wm, 'last_refreshed_at', last_ok,
      'forced_refresh_after', last_ok + max_stale);
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
    RAISE;
  END;

  PERFORM pg_advisory_unlock(lock_key);

  -- 이번에 반영한 원천 지점을 남긴다. 다음 실행의 판단 근거가 된다.
  res := res || jsonb_build_object('source_watermark', src_wm);

  INSERT INTO public.etl_runs (run_key, source, scope, status, started_at, finished_at,
                               inserted_count, error_count, error_log, params)
  VALUES ('market-agg-' || to_char(t0,'YYYYMMDD-HH24MISS'),
          'market-aggregates', 'guarded', 'completed', t0, clock_timestamp(),
          0, 0, '[]'::jsonb, res);

  RETURN res || jsonb_build_object(
    'duration_ms', round(extract(epoch FROM (clock_timestamp() - t0)) * 1000)::int);
END;
$function$;