-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260805225415,
-- name = etl_freshness_cron_cadence_aware.
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
-- 이 구간의 마지막 파일이다. 여기까지 읽어야 최종 상태가 나온다:
--   * ops.etl_freshness()      — 20260805224458 의 정의를 덮는다(severity 에 'unknown' 추가).
--   * ops.record_health_alerts() — 20260805225303 의 정의를 덮는다(unknown 을 경보에서 뺀다).
-- 앞 두 파일만 읽으면 "이력 없는 cron 잡은 critical" 이라는 틀린 결론에 닿는다.
--
-- 되돌리기: 20260805224458 과 20260805225303 의 본문을 다시 적용하면 된다.
--           (그건 오탐이 많은 판정으로 되돌리는 것이다.)

-- 보정: cron.job_run_details 는 약 3일만 보존되므로
--  (a) 실행 이력이 없는 잡을 무조건 critical 로 보면 신규·주간 잡이 전부 오탐이 된다.
--  (b) 주간/월간 잡은 일간 기준(30/50시간)으로 판정하면 안 된다.
-- → 스케줄의 요일/일 필드를 보고 기대 주기를 정하고, 이력이 없으면 'unknown'(경보 제외)으로 둔다.

create or replace function ops.etl_freshness()
returns table (
  check_name text,
  severity   text,   -- ok | warn | critical | unknown
  detail     text,
  last_seen  timestamptz,
  age        interval
)
language sql
stable
security definer
set search_path to 'public', 'ops', 'cron'
as $$
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
         max(created_at) filter (where status = 'ok') as last_ok
  from public.market_ingest_log
  where created_at > now() - interval '14 days'
  group by source
),
news as (select max(created_at) as last_at from public.news_articles),
cronj as (
  select j.jobid, j.jobname, j.schedule,
         -- 스케줄 5필드: 분 시 일 월 요일
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
select format('ingest.%s', s.source),
       case when s.last_ok is null then 'critical'
            when now() - s.last_ok > interval '96 hours' then 'critical'
            when now() - s.last_ok > interval '48 hours' then 'warn'
            else 'ok' end,
       format('마지막 ok %s', coalesce(to_char(s.last_ok at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), '없음(14일 내)')),
       s.last_ok, now() - s.last_ok
from src s
where s.source in ('molit','reb','ecos','onbid','apt-master','apt-detail','geocode')
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
       case when c.last_ok is null then 'unknown'          -- 이력 보존(약 3일) 밖이거나 신규 잡
            when now() - c.last_ok > c.crit_after then 'critical'
            when now() - c.last_ok > c.warn_after then 'warn'
            else 'ok' end,
       format('jobid=%s [%s] 마지막 성공 %s', c.jobid, c.schedule,
              coalesce(to_char(c.last_ok at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), '보존 이력 없음')),
       c.last_ok, now() - c.last_ok
from cronj c
$$;

revoke all on function ops.etl_freshness() from public, anon, authenticated;

-- 경보 적재는 warn/critical 만 (unknown 제외)
create or replace function ops.record_health_alerts()
returns integer
language plpgsql
security definer
set search_path to 'public','ops','cron'
as $$
declare n integer;
begin
  insert into ops.health_alert_log (check_name, severity, detail, age_hours)
  select f.check_name, f.severity, f.detail, round((extract(epoch from f.age)/3600.0)::numeric, 1)
  from ops.etl_freshness() f
  where f.severity in ('warn','critical');
  get diagnostics n = row_count;
  delete from ops.health_alert_log where checked_at < now() - interval '90 days';
  return n;
end;
$$;
revoke all on function ops.record_health_alerts() from public, anon, authenticated;
