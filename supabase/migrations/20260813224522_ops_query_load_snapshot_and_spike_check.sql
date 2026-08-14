-- [2026-08-14] DB 부하 감시 신설.
-- 배경: 오늘 pg_stat_statements 실측에서 단일 쿼리(queryid 2280071763059581382,
-- market_transactions region ANY + contract_ym DESC)가 누적 2,324초 / 85,042콜을 차지했다.
-- 실사용 RUM 은 일 172건 수준인데 DB 읽기량은 시간당 1,000콜 규모다.
-- 그런데 "DB 부하가 갑자기 몇 배로 뛰었다"를 보는 체크가 하나도 없었다.
-- N+1 루프·크롤러 폭주·무한 재시도는 site.http_probe 도 ETL 체크도 못 잡는다.
--
-- pg_stat_statements 는 누적값이므로 스냅샷 2개의 차분으로 구간 부하를 만든다.
-- 리셋(현재 calls < 직전 calls)이 끼면 그 구간은 무효 처리한다.
create table if not exists ops.query_load_snapshot (
  id            bigserial primary key,
  captured_at   timestamptz not null default now(),
  scope         text        not null check (scope in ('global','top')),
  queryid       bigint,
  calls         bigint      not null,
  total_exec_ms numeric     not null,
  mean_ms       numeric,
  max_ms        numeric,
  query_head    text
);

create index if not exists query_load_snapshot_scope_time_idx
  on ops.query_load_snapshot (scope, captured_at desc);
create index if not exists query_load_snapshot_qid_time_idx
  on ops.query_load_snapshot (queryid, captured_at desc) where scope = 'top';

create or replace function ops.capture_query_load()
returns integer
language plpgsql
security definer
set search_path to 'ops', 'extensions', 'public'
as $$
declare n integer;
begin
  insert into ops.query_load_snapshot (scope, queryid, calls, total_exec_ms, mean_ms, max_ms, query_head)
  select 'global', null, coalesce(sum(calls),0), coalesce(sum(total_exec_time),0), null, null, null
  from extensions.pg_stat_statements;

  insert into ops.query_load_snapshot (scope, queryid, calls, total_exec_ms, mean_ms, max_ms, query_head)
  select 'top', s.queryid, s.calls, s.total_exec_time, s.mean_exec_time, s.max_exec_time,
         left(regexp_replace(s.query, '\s+', ' ', 'g'), 160)
  from extensions.pg_stat_statements s
  where s.calls > 100
  order by s.total_exec_time desc
  limit 25;

  get diagnostics n = row_count;

  -- 180일 보존
  delete from ops.query_load_snapshot where captured_at < now() - interval '180 days';
  return n;
end;
$$;

-- 구간 부하(시간당 DB 실행시간). 리셋 구간은 제외.
create or replace function ops.query_load_intervals()
returns table(win_end timestamptz, hours numeric, d_calls bigint, d_ms numeric, ms_per_hour numeric)
language sql
stable
security definer
set search_path to 'ops'
as $$
  with g as (
    select captured_at, calls, total_exec_ms,
           lag(captured_at)   over (order by captured_at) as prev_at,
           lag(calls)         over (order by captured_at) as prev_calls,
           lag(total_exec_ms) over (order by captured_at) as prev_ms
    from ops.query_load_snapshot
    where scope = 'global' and captured_at > now() - interval '30 days'
  )
  select captured_at,
         round(extract(epoch from (captured_at - prev_at))/3600.0, 2),
         calls - prev_calls,
         total_exec_ms - prev_ms,
         round((total_exec_ms - prev_ms) / nullif(extract(epoch from (captured_at - prev_at))/3600.0, 0), 0)
  from g
  where prev_at is not null
    and calls >= prev_calls                                  -- 리셋 구간 제외
    and extract(epoch from (captured_at - prev_at)) > 3600    -- 1시간 미만 구간 제외
  order by captured_at desc;
$$;

grant execute on function ops.capture_query_load()   to postgres;
grant execute on function ops.query_load_intervals() to postgres;

comment on table ops.query_load_snapshot is
  '[2026-08-14] pg_stat_statements 일일 스냅샷. 차분으로 DB 부하 급등(N+1·크롤러 폭주)을 감시한다. 드롭 금지.';

-- 최초 기준선 1건 적재
select ops.capture_query_load();