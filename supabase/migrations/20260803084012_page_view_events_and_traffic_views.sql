-- 어드민 트래픽 대시보드 (2026-08-03)
-- 왜: 접속자(일/주/월/누적)·페이지별 체류시간을 볼 화면이 없다. GA4 는 동의
-- 게이트라 서버에서 못 읽고, 퍼널 이벤트(platform_activity_events)는 "기능
-- 사용"만 담는다. 1st-party 페이지뷰 표를 신설한다.
-- 개인정보: user_email 컬럼 자체를 만들지 않는다. session_key 는 브라우저
-- sessionStorage 의 무작위 값(탭 세션 단위)이고, 수집 자체가 분석 동의
-- (nz_cookie_consent.analytics=true) 뒤에서만 일어난다.
-- 롤백:
--   drop view if exists public.page_view_route_30d;
--   drop view if exists public.page_view_daily;
--   drop view if exists public.platform_event_usage_30d;
--   drop table if exists public.page_view_events;

create table if not exists public.page_view_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  -- 클라이언트 생성 uuid — leave 비콘이 duration 을 채울 때의 열쇠
  view_id uuid not null unique,
  -- 정규화 라우트 (/complex/[id] 등) — 집계 축
  route text not null,
  -- 실제 경로(쿼리 제거, 300자 상한) — 상세 확인용
  path text not null,
  session_key text not null,
  -- 페이지 체류(ms). leave 비콘이 안 오면 null — "측정 못 함"이지 0 이 아니다
  duration_ms integer,
  constraint page_view_events_duration_range check (duration_ms is null or (duration_ms >= 0 and duration_ms <= 3600000))
);

create index if not exists page_view_events_occurred_idx on public.page_view_events (occurred_at desc);
create index if not exists page_view_events_route_idx on public.page_view_events (route, occurred_at desc);
create index if not exists page_view_events_session_idx on public.page_view_events (session_key);

alter table public.page_view_events enable row level security;
-- 정책 없음 = anon/authenticated 접근 불가 (쓰기는 서비스 롤 API 만)
revoke all on public.page_view_events from anon, authenticated;

-- 일별 집계 뷰 — PostgREST 는 GROUP BY 가 없어 뷰가 담당
create or replace view public.page_view_daily as
select
  (occurred_at at time zone 'Asia/Seoul')::date as day,
  count(*) as views,
  count(distinct session_key) as sessions
from public.page_view_events
group by 1;

-- 최근 30일 라우트별 조회·체류 — 평균은 duration 이 실측된 행만으로 계산하고
-- 표본 수(duration_samples)를 함께 내보낸다 (기준 없는 평균 금지)
create or replace view public.page_view_route_30d as
select
  route,
  count(*) as views,
  count(distinct session_key) as sessions,
  count(duration_ms) as duration_samples,
  round(avg(duration_ms) filter (where duration_ms is not null)) as avg_duration_ms
from public.page_view_events
where occurred_at >= now() - interval '30 days'
group by route;

-- 기능 사용 집계 (최근 30일) — 서버 확정 퍼널 이벤트 표 기반
create or replace view public.platform_event_usage_30d as
select
  event_name,
  count(*) as events,
  count(distinct user_email) filter (where user_email is not null) as users
from public.platform_activity_events
where created_at >= now() - interval '30 days'
group by event_name;

-- 뷰 권한: 서비스 롤만 (create or replace 가 grant 를 지우지 않지만 신설이므로 명시)
revoke all on public.page_view_daily from anon, authenticated;
revoke all on public.page_view_route_30d from anon, authenticated;
revoke all on public.platform_event_usage_30d from anon, authenticated;
grant select on public.page_view_daily to service_role;
grant select on public.page_view_route_30d to service_role;
grant select on public.platform_event_usage_30d to service_role;
grant select, insert, update on public.page_view_events to service_role;
