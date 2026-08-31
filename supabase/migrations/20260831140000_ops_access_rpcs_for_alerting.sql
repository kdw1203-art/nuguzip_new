-- [937-①] ops 스키마는 PostgREST exposed schemas에 없다(설계 유지 — docs/security/rls-inventory.md).
-- 그래서 `.schema("ops")` REST 호출은 전부 PGRST106(Invalid schema)으로 실패한다.
-- 실측(2026-08-31): 경보 이메일 크론이 매시간 이 오류로 죽었고, 같은 방식이던
-- 경보 배너·운영 콘솔 경보 판은 조용히 빈 배열을 받아 왔다. 아무도 안 보는 경보는 경보가 아니다.
--
-- 수리 방식: ops를 노출하는 대신, public 스키마의 SECURITY DEFINER RPC로만 좁게 통로를 연다.
-- EXECUTE는 service_role 전용 — anon/authenticated에 GRANT 금지(잠금 원칙).

-- 1) 최근 헬스 경보 조회 (관리자 배너 + /admin/ops 경보 판 + 크론)
create or replace function public.admin_recent_health_alerts(p_days int default 7, p_limit int default 500)
returns table(
  id bigint,
  checked_at timestamptz,
  check_name text,
  severity text,
  detail text,
  age_hours numeric
)
language sql
security definer
set search_path = ops, public
as $$
  select id, checked_at, check_name, severity, detail, age_hours
  from ops.health_alert_log
  where checked_at > now() - make_interval(days => greatest(1, least(p_days, 90)))
  order by checked_at desc
  limit greatest(1, least(p_limit, 2000));
$$;

revoke execute on function public.admin_recent_health_alerts(int, int) from public;
revoke execute on function public.admin_recent_health_alerts(int, int) from anon;
revoke execute on function public.admin_recent_health_alerts(int, int) from authenticated;
grant execute on function public.admin_recent_health_alerts(int, int) to service_role;

-- 2) 경보 이메일 쿨다운 확인용 — 마지막 발송 시각
create or replace function public.admin_last_alert_email()
returns table(
  id bigint,
  sent_at timestamptz,
  alert_count int,
  summary text
)
language sql
security definer
set search_path = ops, public
as $$
  select id, sent_at, alert_count, summary
  from ops.alert_email_log
  order by sent_at desc
  limit 1;
$$;

revoke execute on function public.admin_last_alert_email() from public;
revoke execute on function public.admin_last_alert_email() from anon;
revoke execute on function public.admin_last_alert_email() from authenticated;
grant execute on function public.admin_last_alert_email() to service_role;

-- 3) 경보 이메일 발송 기록 insert
create or replace function public.admin_log_alert_email(p_alert_count int, p_summary text)
returns bigint
language sql
security definer
set search_path = ops, public
as $$
  insert into ops.alert_email_log (alert_count, summary)
  values (greatest(0, p_alert_count), left(coalesce(p_summary, ''), 2000))
  returning id;
$$;

revoke execute on function public.admin_log_alert_email(int, text) from public;
revoke execute on function public.admin_log_alert_email(int, text) from anon;
revoke execute on function public.admin_log_alert_email(int, text) from authenticated;
grant execute on function public.admin_log_alert_email(int, text) to service_role;
