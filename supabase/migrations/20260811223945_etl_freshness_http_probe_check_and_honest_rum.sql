CREATE OR REPLACE FUNCTION ops.etl_freshness()
 RETURNS TABLE(check_name text, severity text, detail text, last_seen timestamp with time zone, age interval)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'ops', 'cron'
AS $function$
with
kpi as (
  select dt, tx_rows_total, row_number() over (order by dt desc) rn
  from public.daily_kpi_snapshot order by dt desc limit 7
),
tx_flat as (
  select count(*) filter (where tx_rows_total = (select tx_rows_total from kpi where rn = 1)) as flat_days
  from kpi
),
tx as (select max(created_at) as last_at from public.market_transactions),
src as (
  select source,
         max(created_at) filter (where status = 'ok' or coalesce(rows, 0) > 0) as last_ok,
         max(created_at) as last_any
  from public.market_ingest_log
  where created_at > now() - interval '14 days'
  group by source
),
srcx as (
  select source,
         case when source in ('geocode','apt-detail') then last_any else last_ok end as signal_at,
         case when source in ('geocode','apt-detail') then '마지막 실행' else '마지막 적재' end as signal_label
  from src
  where source in ('molit','reb','ecos','onbid','apt-master','apt-detail','geocode')
),
news as (select max(created_at) as last_at from public.news_articles),
molit_target as (
  select (regexp_match(dataset, '([0-9]{6})[[:space:]]*$'))[1] as target_ym, created_at
  from public.market_ingest_log
  where source = 'molit' and dataset ~ '[0-9]{6}[[:space:]]*$'
  order by created_at desc
  limit 1
),
cronj as (
  select j.jobid, j.jobname, j.schedule,
         case
           when split_part(j.schedule, ' ', 5) <> '*' then interval '9 days'
           when split_part(j.schedule, ' ', 3) <> '*' then interval '32 days'
           else interval '30 hours'
         end as warn_after,
         case
           when split_part(j.schedule, ' ', 5) <> '*' then interval '12 days'
           when split_part(j.schedule, ' ', 3) <> '*' then interval '35 days'
           else interval '50 hours'
         end as crit_after,
         max(d.end_time) filter (where d.status = 'succeeded') as last_ok
  from cron.job j
  left join cron.job_run_details d on d.jobid = j.jobid
  where j.active
  group by j.jobid, j.jobname, j.schedule
),
-- RUM: 24시간 창 + 14일 일별 중앙값(12h/7일보다 안정적)
rum_cur as (
  select count(*)::bigint as c, max(created_at) as last_at
  from public.web_vitals where created_at > now() - interval '24 hours'
),
rum_base as (
  select coalesce(percentile_cont(0.5) within group (order by c), 0)::numeric as med
  from (
    select d, count(w.*)::bigint c
    from generate_series(1,14) d
    left join public.web_vitals w
      on w.created_at >= now() - (d || ' days')::interval - interval '24 hours'
     and w.created_at <  now() - (d || ' days')::interval
    group by d
  ) x
),
pipe as (select max(created_at) as last_at from public.market_ingest_log),
probe as (
  select probed_at, http_status, ttfb_ms, vercel_error, url
  from ops.site_probe order by probed_at desc limit 1
)
select 'market_transactions.ingest'::text,
       case when (select flat_days from tx_flat) >= 3 then 'critical'
            when (select flat_days from tx_flat) >= 2 then 'warn'
            else 'ok' end,
       format('누적 행수 정체 %s일 · 마지막 적재 %s',
              (select flat_days from tx_flat),
              to_char((select last_at from tx) at time zone 'Asia/Seoul', 'MM-DD HH24:MI')),
       (select last_at from tx),
       now() - (select last_at from tx)
union all
select 'market_transactions.month_rollover',
       case when m.target_ym is null then 'unknown'
            when m.target_ym >= to_char(now() at time zone 'Asia/Seoul', 'YYYYMM') then 'ok'
            when extract(day from now() at time zone 'Asia/Seoul')::int >= 3 then 'critical'
            else 'warn' end,
       format('ETL 조회 대상 월=%s · 당월=%s%s',
              coalesce(m.target_ym, '판독불가'),
              to_char(now() at time zone 'Asia/Seoul', 'YYYYMM'),
              case when m.target_ym is not null
                    and m.target_ym < to_char(now() at time zone 'Asia/Seoul', 'YYYYMM')
                   then ' — 당월로 롤오버되지 않음' else '' end),
       m.created_at,
       now() - m.created_at
from molit_target m
union all
select format('ingest.%s', s.source),
       case when s.signal_at is null then 'critical'
            when now() - s.signal_at > interval '96 hours' then 'critical'
            when now() - s.signal_at > interval '48 hours' then 'warn'
            else 'ok' end,
       format('%s %s', s.signal_label,
              coalesce(to_char(s.signal_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), '없음(14일 내)')),
       s.signal_at, now() - s.signal_at
from srcx s
union all
select 'news_articles.ingest',
       case when now() - n.last_at > interval '48 hours' then 'critical'
            when now() - n.last_at > interval '30 hours' then 'warn'
            else 'ok' end,
       format('마지막 기사 적재 %s', to_char(n.last_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI')),
       n.last_at, now() - n.last_at
from news n
union all
select format('cron.%s', c.jobname),
       case when c.last_ok is null then 'unknown'
            when now() - c.last_ok > c.crit_after then 'critical'
            when now() - c.last_ok > c.warn_after then 'warn'
            else 'ok' end,
       format('jobid=%s [%s] 마지막 성공 %s', c.jobid, c.schedule,
              coalesce(to_char(c.last_ok at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), '보존 이력 없음')),
       c.last_ok, now() - c.last_ok
from cronj c
union all
-- 사이트 생존 1순위: 실제 HTTP 프로브(외부 예약 잡이 ops.record_site_probe 로 기록)
select 'site.http_probe',
       case when p.probed_at is null then 'unknown'
            when p.http_status is null or p.http_status >= 500 then 'critical'
            when p.http_status >= 400 then 'warn'
            when now() - p.probed_at > interval '50 hours' then 'critical'
            when now() - p.probed_at > interval '26 hours' then 'warn'
            else 'ok' end,
       format('%s → HTTP %s%s · 프로브 %s (%sh 전)',
              coalesce(p.url, 'https://nuguzip.com/'),
              coalesce(p.http_status::text, '무응답'),
              case when p.vercel_error is not null then ' ['||p.vercel_error||']' else '' end,
              to_char(p.probed_at at time zone 'Asia/Seoul','MM-DD HH24:MI'),
              round(extract(epoch from (now() - p.probed_at))/3600.0, 1)),
       p.probed_at, now() - p.probed_at
from probe p
union all
-- 프로브 이력이 아예 없을 때도 행이 사라지지 않도록
select 'site.http_probe', 'unknown',
       '프로브 이력 없음 — 예약 잡이 ops.record_site_probe() 를 호출해야 함', null::timestamptz, null::interval
where not exists (select 1 from ops.site_probe)
union all
-- RUM: 트래픽이 충분할 때만 판정한다. 현 트래픽(일 중앙값 ~170건, 28일 중 10일 0건)에서는
-- 어떤 창 길이로도 다운 판정이 불가능함이 측정으로 확인됨 → 표본 부족 시 'unknown' + 사유 명시.
select 'site.rum_heartbeat',
       case when (select med from rum_base) < 500 then 'unknown'
            when (select c from rum_cur) = 0 then 'critical'
            when (select c from rum_cur) < (select med from rum_base) * 0.05 then 'critical'
            when (select c from rum_cur) < (select med from rum_base) * 0.25 then 'warn'
            else 'ok' end,
       format('최근 24시간 RUM %s건 (14일 일중앙값 %s건)%s',
              (select c from rum_cur),
              round((select med from rum_base)),
              case when (select med from rum_base) < 500
                   then ' — 표본 부족: RUM 으로 사이트 생존 판정 불가. site.http_probe 로 판단할 것'
                   else '' end),
       (select max(created_at) from public.web_vitals),
       now() - (select max(created_at) from public.web_vitals)
union all
select 'ingest.pipeline_heartbeat',
       case when p.last_at is null then 'unknown'
            when now() - p.last_at > interval '36 hours' then 'critical'
            when now() - p.last_at > interval '26 hours' then 'warn'
            else 'ok' end,
       format('전 소스 통합 마지막 실행 %s (%sh 전) · 정상 최대 간격 약 23h',
              to_char(p.last_at at time zone 'Asia/Seoul','MM-DD HH24:MI'),
              round(extract(epoch from (now() - p.last_at))/3600.0, 1)),
       p.last_at, now() - p.last_at
from pipe p
$function$;