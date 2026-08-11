-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260810002714,
-- name = market_aggregates_health_source_aware_v2.
-- 아래 본문은 그 원장의 statements 원문 그대로다(md5 7e3f444299e68a82b64be07592d72531 · 2524b —
-- 원장 md5 와 바이트 단위 대조 완료). 내가 새로 쓴 문장은 이 머리말뿐이고
-- SQL 은 한 글자도 손대지 않았다. 이 파일이 적용 시점에 쓰였다는 뜻이 아니다.
--
-- 왜 비어 있었나: 2026-08-10 병렬 세션(소유자 승인 ops 작업)이 MCP 로 적용하고
-- 파일 미러링을 남기지 않았다. 같은 날 6건(20260810001136~20260810004552)을
-- 2026-08-11 에 한꺼번에 복원했다.
--
-- 되돌리기: drop view reporting.market_aggregates_health; (v1 정의로 재생성하려면 이전 마이그레이션 참조)

DROP VIEW IF EXISTS reporting.market_aggregates_health;

/* 2026-08-10 — 뷰가 "집계를 언제 다시 계산했나"만 보고 있었다.
   그래서 MOLIT 인제스트가 08-03 에 죽은 뒤로도 6일 내내 초록불이었다.
   이제 원천 워터마크를 함께 본다. */
CREATE VIEW reporting.market_aggregates_health AS
WITH wm AS (
  SELECT greatest(
           (SELECT max(created_at) FROM public.market_transactions),
           (SELECT max(updated_at) FROM public.market_transactions),
           (SELECT max(updated_at) FROM public.apartment_complexes)) AS source_watermark,
         (SELECT max(created_at) FROM public.market_transactions)    AS last_source_insert,
         (SELECT max(updated_at) FROM public.market_region_monthly)  AS region_monthly_updated_at
)
SELECT
  wm.region_monthly_updated_at,
  round(EXTRACT(epoch FROM now() - wm.region_monthly_updated_at) / 3600.0, 1) AS region_monthly_age_hours,
  (SELECT max(finished_at) FROM public.etl_runs
     WHERE source = 'market-aggregates' AND status = 'completed')             AS last_ok,
  (SELECT round(EXTRACT(epoch FROM finished_at - started_at))::integer
     FROM public.etl_runs
    WHERE source = 'market-aggregates' AND status = 'completed'
    ORDER BY started_at DESC LIMIT 1)                                         AS last_duration_sec,
  (SELECT max(started_at) FROM public.etl_runs
     WHERE source = 'market-aggregates-http')                                 AS last_http_deferred_at,
  (SELECT count(*)::integer
     FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'market-aggregates-daily'
      AND d.status <> 'succeeded' AND d.start_time > now() - interval '7 days') AS cron_failures_7d,
  (SELECT d.start_time
     FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'market-aggregates-daily'
    ORDER BY d.start_time DESC LIMIT 1)                                       AS last_cron_run_at,
  wm.source_watermark,
  round(EXTRACT(epoch FROM now() - wm.last_source_insert) / 3600.0, 1)        AS source_insert_age_hours,
  (wm.source_watermark > wm.region_monthly_updated_at)                        AS aggregate_behind,
  (SELECT max(started_at) FROM public.etl_runs
     WHERE source = 'market-aggregates' AND status = 'skipped')               AS last_skipped_at,
  (SELECT count(*)::integer FROM public.etl_runs
     WHERE source = 'market-aggregates' AND status = 'skipped'
       AND started_at > now() - interval '7 days')                            AS skipped_7d
FROM wm;

GRANT SELECT ON reporting.market_aggregates_health TO postgres, service_role;