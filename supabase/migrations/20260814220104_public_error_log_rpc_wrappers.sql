-- [2026-08-14] ops.error_log 의 public RPC 래퍼 — PostgREST 는 ops 스키마를
-- 노출하지 않으므로(내부 운영 스키마), 앱(서비스롤)이 REST 로 부를 수 있는
-- public 함수를 통해서만 접근한다. 둘 다 SECURITY DEFINER + anon/authenticated
-- 실행 회수(서비스롤만 호출). record_error 는 이미 ops 에 있는 것을 위임 호출한다.
--
-- 롤백: drop function public.record_error(text,text,text,text,text,text,jsonb);
--       drop function public.admin_recent_errors(integer);

-- 쓰기 위임 — lib/monitoring/capture 가 sb.rpc('record_error', {...}) 로 부른다.
create or replace function public.record_error(
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
set search_path to 'public','ops','pg_catalog'
as $$
  select ops.record_error(p_fingerprint, p_level, p_source, p_message, p_stack, p_path, p_context);
$$;

revoke all on function public.record_error(text,text,text,text,text,text,jsonb) from public, anon, authenticated;

-- 읽기 — /admin/ops 가 sb.rpc('admin_recent_errors', { p_limit }) 로 부른다.
create or replace function public.admin_recent_errors(p_limit integer default 20)
returns table(
  fingerprint text, level text, source text, message text, path text,
  count bigint, first_seen timestamptz, last_seen timestamptz
)
language sql
stable
security definer
set search_path to 'public','ops','pg_catalog'
as $$
  select fingerprint, level, source, message, path, count, first_seen, last_seen
  from ops.error_log
  order by last_seen desc
  limit greatest(1, least(100, coalesce(p_limit, 20)));
$$;

revoke all on function public.admin_recent_errors(integer) from public, anon, authenticated;

-- 24시간 총 발생 수(집계) — 별도 함수로 가볍게
create or replace function public.admin_error_count_24h()
returns bigint
language sql
stable
security definer
set search_path to 'public','ops','pg_catalog'
as $$
  select coalesce(sum(count), 0)::bigint
  from ops.error_log
  where last_seen > now() - interval '24 hours';
$$;

revoke all on function public.admin_error_count_24h() from public, anon, authenticated;