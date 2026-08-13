-- 리포트 노이즈 정리: 대체된 레거시 파이프라인을 '은퇴'로 표시한다.
-- pipeline_health 행을 숨기지 않고 retired 플래그만 붙인다 — 조용한 누락 방지.
CREATE TABLE IF NOT EXISTS reporting.retired_sources (
  source     text PRIMARY KEY,
  retired_at timestamptz NOT NULL DEFAULT now(),
  note       text
);

INSERT INTO reporting.retired_sources (source, note) VALUES
  ('daily-auto-register',    '레거시 Vercel ETL 경로. 마지막 실행 2026-07-17, 현행 수집은 market_ingest_log 계열이 담당'),
  ('public-data',            '레거시 Vercel ETL 경로. apt-master/apt-detail(market_ingest_log)로 대체'),
  ('map-data-refresh',       '레거시. pg_cron map-metric-snapshots-daily(03:30 KST)로 대체'),
  ('news-publish',           '레거시. ingest_daily_news RPC 일일 수집으로 대체'),
  ('market-aggregates-http', 'Vercel HTTP 경로. pg_cron market-aggregates-daily(04:00 KST)와 중복 — 라우트 삭제 예정. statement_timeout 부족으로 스스로 deferred 처리해 실제 갱신은 하지 않음')
ON CONFLICT (source) DO UPDATE SET note = EXCLUDED.note;

CREATE OR REPLACE VIEW reporting.pipeline_health AS
WITH base AS (
  SELECT 'etl_runs'::text AS kind,
      etl_runs.source,
      NULL::text AS dataset,
      max(etl_runs.started_at) AS last_started,
      max(etl_runs.started_at) FILTER (WHERE etl_runs.status = ANY (ARRAY['completed','success','ok'])) AS last_ok,
      round(EXTRACT(epoch FROM now() - max(etl_runs.started_at)) / 3600.0, 1) AS hours_since_last,
      count(*)::integer AS runs
    FROM etl_runs
    GROUP BY 1, etl_runs.source
  UNION ALL
  SELECT 'market_ingest_log',
      market_ingest_log.source,
      NULL::text,
      max(market_ingest_log.created_at),
      max(market_ingest_log.created_at) FILTER (WHERE market_ingest_log.status = 'ok'),
      round(EXTRACT(epoch FROM now() - max(market_ingest_log.created_at)) / 3600.0, 1),
      count(*)::integer
    FROM market_ingest_log
    GROUP BY 1, market_ingest_log.source
  UNION ALL
  SELECT 'map_metric_refresh',
      'map-metrics',
      NULL::text,
      max(map_metric_refresh_runs.started_at),
      max(map_metric_refresh_runs.started_at) FILTER (WHERE map_metric_refresh_runs.status = 'completed'),
      round(EXTRACT(epoch FROM now() - max(map_metric_refresh_runs.started_at)) / 3600.0, 1),
      count(*)::integer
    FROM map_metric_refresh_runs
)
SELECT b.*,
       (r.source IS NOT NULL) AS retired,
       r.note AS retired_note
FROM base b
LEFT JOIN reporting.retired_sources r ON r.source = b.source;