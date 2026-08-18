-- 소셜 산출물 하트비트를 P3 경보에 편입 (2026-08-18, 운영 정본 자동화 로드맵 1)
--
-- 소셜 파이프라인 첫 실가동 성공(02:00 UTC autopost 200 · 소재 1건 큐 등록)을
-- 확인한 직후의 약속 이행: 이제부터 소재 생성이 26h 넘게 끊기면 warn,
-- 50h 넘으면 critical 로 기존 헬스 경보 체계(로그+인박스 통지)에 오른다.
-- 임계는 일일 크론 체크의 기존 관례(news_articles·site.http_probe)와 동일.

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
  select coalesce(
           (select max((regexp_match(dataset, '([0-9]{6})[[:space:]]*$'))[1])
              from public.market_ingest_log
             where source = 'molit' and dataset ~ '[0-9]{6}[[:space:]]*$'
               and created_at > now() - interval '26 hours'),
           (select (regexp_match(dataset, '([0-9]{6})[[:space:]]*$'))[1]
              from public.market_ingest_log
             where source = 'molit' and dataset ~ '[0-9]{6}[[:space:]]*$'
             order by created_at desc limit 1)
         ) as target_ym,
         (select max(created_at) from public.market_ingest_log
           where source = 'molit' and dataset ~ '[0-9]{6}[[:space:]]*$') as created_at
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
social as (select max(created_at) as last_at from public.social_uploads),
probe as (
  select probed_at, http_status, ttfb_ms, vercel_error, url
  from ops.site_probe order by probed_at desc limit 1
),
bill_unfulfilled as (
  select
    (select count(*) from public.payment_orders o
      where o.status = 'paid' and o.subscription_id is null
        and o.updated_at < now() - interval '15 minutes')
    +
    (select count(*) from public.payments p
      where p.status = 'paid'
        and p.paid_at < now() - interval '15 minutes'  -- 반영 지연 유예
        and p.paid_at > now() - interval '48 hours'    -- 감시 창(오래된 이력은 별도 조사 대상)
        and p.user_email is not null
        and p.plan in ('pro','expert')                 -- 멤버십을 부여하는 결제만(basic 은 단품)
        and not exists (
          select 1 from public.app_users u
           where lower(u.email) = lower(p.user_email)
             and (u.plan = p.plan or (p.plan = 'pro' and u.plan = 'expert')) -- 상위 플랜 보유 = 이행
             and (u.plan_expires_at is null or u.plan_expires_at > now())))
    as n,
    greatest(
      coalesce((select max(o.updated_at) from public.payment_orders o where o.status='paid'), '-infinity'::timestamptz),
      coalesce((select max(p.paid_at)    from public.payments p       where p.status='paid'), '-infinity'::timestamptz)
    ) as last_paid_at
),
bill_fail as (
  select
    (select count(*) from public.payment_orders where status='failed' and updated_at > now() - interval '24 hours')
  + (select count(*) from public.payments      where status='failed' and failed_at  > now() - interval '24 hours') as fails,
    (select count(*) from public.payment_orders where created_at   > now() - interval '24 hours')
  + (select count(*) from public.payments      where requested_at > now() - interval '24 hours') as attempts
),
-- [2026-08-14 신설] DB 부하 급등 감시
ql as (select *, row_number() over (order by win_end desc) rn from ops.query_load_intervals()),
ql_now as (select * from ql where rn = 1),
ql_base as (
  select count(*)::int as n,
         percentile_cont(0.5) within group (order by ms_per_hour)::numeric as med
  from ql where rn between 2 and 8
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
select 'site.http_probe', 'unknown',
       '프로브 이력 없음 — 예약 잡이 ops.record_site_probe() 를 호출해야 함', null::timestamptz, null::interval
where not exists (select 1 from ops.site_probe)
union all
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
union all
select 'social.autopost_heartbeat',
       case when s.last_at is null then 'unknown'
            when now() - s.last_at > interval '50 hours' then 'critical'
            when now() - s.last_at > interval '26 hours' then 'warn'
            else 'ok' end,
       format('마지막 소셜 소재 생성 %s (%sh 전) · 크론 매일 11:00 KST',
              coalesce(to_char(s.last_at at time zone 'Asia/Seoul','MM-DD HH24:MI'), '이력 없음'),
              round(extract(epoch from (now() - s.last_at))/3600.0, 1)),
       s.last_at, now() - s.last_at
from social s
union all
select 'billing.fulfillment',
       case when b.n > 0 then 'critical' else 'ok' end,
       format('결제 성공 후 구독 미부여 %s건%s', b.n,
              case when b.last_paid_at > '-infinity'::timestamptz
                   then ' · 마지막 결제 성공 '||to_char(b.last_paid_at at time zone 'Asia/Seoul','MM-DD HH24:MI')
                   else ' · 유료 결제 성공 이력 아직 없음' end),
       nullif(b.last_paid_at, '-infinity'::timestamptz),
       now() - nullif(b.last_paid_at, '-infinity'::timestamptz)
from bill_unfulfilled b
union all
select 'billing.payment_failures',
       case when f.fails >= 3 and f.fails::numeric / nullif(f.attempts,0) > 0.5 then 'critical'
            when f.fails >= 1 then 'warn'
            else 'ok' end,
       format('최근 24시간 결제 실패 %s건 / 시도 %s건', f.fails, f.attempts),
       null::timestamptz, null::interval
from bill_fail f
union all
select 'db.query_load',
       case when (select n from ql_base) < 2 or (select med from ql_base) is null then 'unknown'
            when (select ms_per_hour from ql_now) > (select med from ql_base) * 3
             and (select ms_per_hour from ql_now) > 500000 then 'critical'
            when (select ms_per_hour from ql_now) > (select med from ql_base) * 2
             and (select ms_per_hour from ql_now) > 300000 then 'warn'
            else 'ok' end,
       case when (select n from ql_base) < 2 or (select med from ql_base) is null
            then format('스냅샷 이력 부족 (기준 구간 %s/2) — 판정 불가. ops.capture_query_load() 누적 대기 중',
                        coalesce((select n from ql_base), 0))
            else format('DB 실행시간 %s ms/h (직전 최대 7구간 중앙값 %s ms/h · %s배)',
                        round((select ms_per_hour from ql_now)::numeric),
                        round((select med from ql_base)),
                        round(((select ms_per_hour from ql_now)::numeric
                               / nullif((select med from ql_base), 0)), 2))
       end,
       (select win_end from ql_now),
       now() - (select win_end from ql_now)
$function$