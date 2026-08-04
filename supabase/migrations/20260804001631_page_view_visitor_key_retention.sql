-- 웹30 — 재방문(리텐션) 지표 (2026-08-04)
-- session_key 는 탭 세션(sessionStorage) 단위라 재방문을 이을 수 없다 —
-- localStorage 무작위 키(visitor_key)를 추가한다. 계정·PII 무관, 수집은
-- 분석 동의 뒤에서만(기존 session_key 와 동일 게이트).
-- 롤백:
--   drop view if exists public.page_view_retention_30d;
--   drop index if exists page_view_events_visitor_idx;
--   alter table public.page_view_events drop column if exists visitor_key;
alter table public.page_view_events add column if not exists visitor_key text;
create index if not exists page_view_events_visitor_idx
  on public.page_view_events (visitor_key) where visitor_key is not null;

create or replace view public.page_view_retention_30d as
with per_visitor as (
  select visitor_key,
         count(distinct (occurred_at at time zone 'Asia/Seoul')::date) as active_days
  from public.page_view_events
  where visitor_key is not null
    and occurred_at >= now() - interval '30 days'
  group by visitor_key
)
select
  count(*)::bigint as visitors,
  count(*) filter (where active_days >= 2)::bigint as returning_visitors
from per_visitor;

revoke all on public.page_view_retention_30d from anon, authenticated;
grant select on public.page_view_retention_30d to service_role;
