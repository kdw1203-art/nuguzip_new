-- 트래픽 대시보드 기간 요약 (2026-08-03 2차)
-- 일별 뷰의 "일별 distinct 합"은 기간 순방문자가 아니다 — 같은 세션이 이틀
-- 걸치면 두 번 세진다. 기간별 distinct 는 SQL 이 계산해 한 행으로 준다.
-- 롤백: drop view if exists public.page_view_summary;
create or replace view public.page_view_summary as
select
  count(distinct session_key) filter (where occurred_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') as sessions_today,
  count(*) filter (where occurred_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') as views_today,
  count(distinct session_key) filter (where occurred_at >= now() - interval '7 days') as sessions_7d,
  count(distinct session_key) filter (where occurred_at >= now() - interval '30 days') as sessions_30d,
  count(distinct session_key) as sessions_total,
  count(*) as views_total,
  min(occurred_at) as first_event_at
from public.page_view_events;

revoke all on public.page_view_summary from anon, authenticated;
grant select on public.page_view_summary to service_role;
