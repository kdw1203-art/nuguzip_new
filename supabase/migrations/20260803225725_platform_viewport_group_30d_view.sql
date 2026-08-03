-- 모바일29 — 트래픽 대시보드 모바일/데스크탑 세션 비율 (2026-08-03)
-- 근거: viewport_group_change 이벤트의 kind='initial'(세션 시작 그룹)만 센다 —
-- change 까지 세면 리사이즈·회전이 세션처럼 부풀려진다.
-- 롤백:
--   drop view if exists public.platform_viewport_group_30d;
create or replace view public.platform_viewport_group_30d as
select
  coalesce(metadata->>'viewport_group', '(미상)') as viewport_group,
  count(*)::bigint as sessions
from public.platform_activity_events
where event_name = 'viewport_group_change'
  and coalesce(metadata->>'kind', '') = 'initial'
  and created_at >= now() - interval '30 days'
group by 1;

revoke all on public.platform_viewport_group_30d from anon, authenticated;
grant select on public.platform_viewport_group_30d to service_role;
