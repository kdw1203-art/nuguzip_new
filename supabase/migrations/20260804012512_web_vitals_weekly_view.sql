-- 웹18 — 웹바이탈 주간 p75 추이 (2026-08-04)
-- p75 는 percentile_cont 로 DB 에서 계산한다(행을 다 끌어와 JS 정렬하는
-- 방식은 표본이 늘수록 무거워진다). 최근 12주(84일) 창.
-- 롤백: drop view if exists public.web_vitals_weekly;
create or replace view public.web_vitals_weekly as
select
  (date_trunc('week', created_at at time zone 'Asia/Seoul'))::date as week_start,
  metric,
  count(*)::bigint as samples,
  percentile_cont(0.75) within group (order by value) as p75
from public.web_vitals
where created_at >= now() - interval '84 days'
group by 1, 2;

revoke all on public.web_vitals_weekly from anon, authenticated;
grant select on public.web_vitals_weekly to service_role;
