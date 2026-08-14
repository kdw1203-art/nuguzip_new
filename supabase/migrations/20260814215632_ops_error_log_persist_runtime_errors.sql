-- [2026-08-14] 운영 에러 로그 영속화 — 프로덕션 런타임 에러 가시화.
--
-- 배경(제품 리뷰 최우선 결함): lib/monitoring/capture 는 capture-only 라
-- ALERT_WEBHOOK_URL·SENTRY_DSN 미설정이면 프로덕션 에러가 로그로만 흘러가
-- 사실상 아무도 못 본다(Vercel 함수 로그를 사람이 상시 뒤지지 않는 한).
-- 외부 APM 자격증명 없이도 에러가 "보이게" 하려면 우리 DB 에 남겨야 한다.
--
-- 설계:
--  - RLS 정책 없음(서비스롤 전용) — 스택·경로가 담겨 공개 노출 이유가 없다.
--  - fingerprint(메시지+scope 해시)로 같은 에러를 묶고 last_seen·count 를 올린다
--    (같은 버그가 1000번 나도 1행 — 폭주로 표가 터지지 않게).
--  - 30일 보존 pg_cron. 텔레메트리 보존 규약과 동일.
--
-- 롤백: select cron.unschedule('error-log-retention');
--       drop function ops.record_error(...);  drop table ops.error_log;
create schema if not exists ops;

create table if not exists ops.error_log (
  fingerprint  text primary key,
  level        text not null default 'error' check (level in ('error','message')),
  source       text,                    -- 'client' | 'server' | route/scope
  message      text not null,
  stack        text,
  path         text,
  count        bigint not null default 1,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  last_context jsonb
);
create index if not exists error_log_last_seen_idx on ops.error_log (last_seen desc);

alter table ops.error_log enable row level security;
comment on table ops.error_log is
  '운영 에러 집계 로그(client/server). fingerprint 로 묶어 count·last_seen 갱신. 정책 없는 RLS = 서비스롤 전용.';

-- upsert 헬퍼 — 앱(서비스롤)이 부른다. 메시지는 1KB, 스택은 4KB 로 잘라 담는다.
create or replace function ops.record_error(
  p_fingerprint text,
  p_level       text,
  p_source      text,
  p_message     text,
  p_stack       text,
  p_path        text,
  p_context     jsonb
) returns void
language sql
security definer
set search_path to 'ops','pg_catalog'
as $$
  insert into ops.error_log (fingerprint, level, source, message, stack, path, last_context)
  values (
    left(coalesce(p_fingerprint, 'unknown'), 200),
    case when p_level in ('error','message') then p_level else 'error' end,
    left(p_source, 120),
    left(coalesce(p_message, ''), 1000),
    left(p_stack, 4000),
    left(p_path, 300),
    p_context
  )
  on conflict (fingerprint) do update
    set count = ops.error_log.count + 1,
        last_seen = now(),
        message = excluded.message,
        stack = coalesce(excluded.stack, ops.error_log.stack),
        path = coalesce(excluded.path, ops.error_log.path),
        last_context = excluded.last_context;
$$;

revoke all on function ops.record_error(text,text,text,text,text,text,jsonb) from public, anon, authenticated;

-- 30일 보존
create or replace function ops.prune_error_log() returns integer
language plpgsql security definer set search_path to 'ops','pg_catalog'
as $$
declare n integer;
begin
  delete from ops.error_log where last_seen < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function ops.prune_error_log() from public, anon, authenticated;

select cron.schedule('error-log-retention', '17 3 * * *', $$select ops.prune_error_log()$$);