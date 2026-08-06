-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260805224458,
-- name = ops_etl_freshness_watchdog.
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
-- 원문 그대로 두는 것 하나: 본문 머리말이 "2026-08-06 기준 사고"라고 적었지만 이
-- 마이그레이션의 적용 버전은 20260805 다. 원장 원문을 고치지 않는 게 이 파일의
-- 목적이라 그대로 둔다.
--
-- 되돌리기: drop function ops.etl_freshness();

-- 목적: ETL/파이프라인 정체를 사람이 눈으로 찾지 않아도 한 번의 호출로 드러내는 단일 진실원(single source of truth).
-- 2026-08-06 기준 사고: market_transactions 가 2026-08-03 이후 3일간 0행 증가했으나 아무 신호도 없었음.
-- 원칙: 읽기 전용, 인덱스만 사용, 100ms 이내. 구조 변경 없음.

create or replace function ops.etl_freshness()
returns table (
  check_name text,
  severity   text,   -- ok | warn | critical
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
-- 1) 실거래 원천: 신규 행이 들어오고 있는가 (KPI 스냅샷의 누적 행수로 정체일수 판정)
kpi as (
  select dt, tx_rows_total,
         row_number() over (order by dt desc) rn
  from public.daily_kpi_snapshot
  order by dt desc
  limit 7
),
tx_flat as (
  select count(*) filter (
           where tx_rows_total = (select tx_rows_total from kpi where rn = 1)
         ) as flat_days
  from kpi
),
tx as (
  select max(created_at) as last_at from public.market_transactions
),
-- 2) 수집 로그: 원천별 마지막 성공
src as (
  select source,
         max(created_at) filter (where status = 'ok') as last_ok,
         max(created_at)                              as last_any
  from public.market_ingest_log
  where created_at > now() - interval '14 days'
  group by source
),
-- 3) 뉴스
news as (
  select max(created_at) as last_at from public.news_articles
),
-- 4) cron 잡: 운영 필수 잡의 마지막 성공
cronj as (
  select j.jobid, j.jobname,
         max(d.end_time) filter (where d.status = 'succeeded') as last_ok
  from cron.job j
  left join cron.job_run_details d on d.jobid = j.jobid
  where j.active
  group by j.jobid, j.jobname
)
-- 실거래 신규 유입
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
-- 원천별 마지막 성공 (48시간 초과 시 경고, 96시간 초과 시 심각)
select format('ingest.%s', s.source),
       case when s.last_ok is null then 'critical'
            when now() - s.last_ok > interval '96 hours' then 'critical'
            when now() - s.last_ok > interval '48 hours' then 'warn'
            else 'ok' end,
       format('마지막 ok %s',
              coalesce(to_char(s.last_ok at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), '없음(14일 내)')),
       s.last_ok,
       now() - s.last_ok
from src s
where s.source in ('molit','reb','ecos','onbid','apt-master','apt-detail','geocode')
union all
-- 뉴스
select 'news_articles.ingest',
       case when now() - n.last_at > interval '48 hours' then 'critical'
            when now() - n.last_at > interval '30 hours' then 'warn'
            else 'ok' end,
       format('마지막 기사 적재 %s', to_char(n.last_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI')),
       n.last_at,
       now() - n.last_at
from news n
union all
-- cron 잡 (일 1회 이상 도는 잡 기준 30시간 / 시간당 잡은 별도 판정하지 않고 동일 기준 사용)
select format('cron.%s', c.jobname),
       case when c.last_ok is null then 'critical'
            when now() - c.last_ok > interval '50 hours' then 'critical'
            when now() - c.last_ok > interval '30 hours' then 'warn'
            else 'ok' end,
       format('jobid=%s 마지막 성공 %s', c.jobid,
              coalesce(to_char(c.last_ok at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), '없음')),
       c.last_ok,
       now() - c.last_ok
from cronj c
$$;

revoke all on function ops.etl_freshness() from public, anon, authenticated;
comment on function ops.etl_freshness() is
  '운영 헬스체크: ETL 원천·뉴스·cron 잡의 신선도를 severity(ok/warn/critical)로 반환. 2026-08-06 실거래 3일 정체 미탐지 사고 대응.';
