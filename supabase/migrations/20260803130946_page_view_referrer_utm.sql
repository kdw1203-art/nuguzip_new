-- 유입 출처·UTM (2026-08-03 3차) — 소유자 요청: 방문자가 어디서·어떤 링크로 왔는지.
-- 개인정보: referrer 는 **호스트만** 저장한다(전체 URL 은 검색어·개인 경로가
-- 실릴 수 있다). UTM 3종은 우리가 발행한 캠페인 값이라 저장 가능. 랜딩(세션
-- 첫 뷰)에만 기록 — 내부 이동의 same-origin referrer 는 유입이 아니다.
-- 롤백:
--   drop view if exists public.page_view_referrer_30d;
--   drop view if exists public.page_view_utm_30d;
--   alter table public.page_view_events
--     drop column if exists referrer_host,
--     drop column if exists utm_source,
--     drop column if exists utm_medium,
--     drop column if exists utm_campaign,
--     drop column if exists is_landing;

alter table public.page_view_events
  add column if not exists is_landing boolean not null default false,
  add column if not exists referrer_host text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

-- 유입 출처 집계 (최근 30일 · 랜딩만). referrer_host null = 직접 유입
-- (주소창·앱·북마크 — 브라우저가 리퍼러를 안 보낸 경우 포함, 구분 불가).
create or replace view public.page_view_referrer_30d as
select
  coalesce(referrer_host, '(직접/앱)') as source,
  count(*) as landings,
  count(distinct session_key) as sessions
from public.page_view_events
where is_landing and occurred_at >= now() - interval '30 days'
group by 1;

create or replace view public.page_view_utm_30d as
select
  coalesce(utm_source, '(없음)') as utm_source,
  coalesce(utm_medium, '') as utm_medium,
  coalesce(utm_campaign, '') as utm_campaign,
  count(*) as landings,
  count(distinct session_key) as sessions
from public.page_view_events
where is_landing
  and occurred_at >= now() - interval '30 days'
  and (utm_source is not null or utm_medium is not null or utm_campaign is not null)
group by 1, 2, 3;

revoke all on public.page_view_referrer_30d from anon, authenticated;
revoke all on public.page_view_utm_30d from anon, authenticated;
grant select on public.page_view_referrer_30d to service_role;
grant select on public.page_view_utm_30d to service_role;
