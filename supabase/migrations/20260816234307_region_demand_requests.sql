-- 커버 밖 수요 수집(#413) — 검색 무결과에서 "열리면 알려주세요" 요청을 모은다.
-- 지역 확장 우선순위를 감이 아니라 이 표의 수요 숫자로 정하는 것이 목적.
-- 쓰기는 service role 전용(API 경유), 클라이언트 직접 접근 없음 → RLS on + 정책 없음.
create table public.region_demand_requests (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  query_norm text generated always as (lower(btrim(query))) stored,
  source text not null default 'search',
  emails text[] not null default '{}',
  count integer not null default 1,
  created_day date not null default ((now() at time zone 'utc')::date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint region_demand_query_len check (char_length(btrim(query)) between 1 and 80),
  constraint region_demand_source_len check (char_length(source) <= 24),
  constraint region_demand_emails_cap check (coalesce(array_length(emails, 1), 0) <= 20)
);

comment on table public.region_demand_requests is
  '커버리지 밖 검색 수요 — (query_norm, created_day) 당 1행, count 로 반복 수요 집계. 확장 우선순위 근거.';

-- 같은 검색어는 하루 한 행으로 접고 count 를 올린다 (테이블 증식 상한)
create unique index region_demand_requests_norm_day_key
  on public.region_demand_requests (query_norm, created_day);
create index region_demand_requests_created_idx
  on public.region_demand_requests (created_at desc);

alter table public.region_demand_requests enable row level security;