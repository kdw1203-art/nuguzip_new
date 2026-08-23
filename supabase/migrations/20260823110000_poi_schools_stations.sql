-- [#96] 생활 인프라 데이터 — 학교·도시철도역 좌표 (표준데이터 인제스트 수신처).
-- 단지 페이지 "도보권 학교·역" 섹션의 저장소. RLS deny-all(service_role 경유만) —
-- 값은 공공데이터(공공누리 1유형)지만 쓰기 경로를 좁히는 관례를 따른다.
create table if not exists public.poi_schools (
  id bigint generated always as identity primary key,
  source_key text not null unique,          -- 표준데이터 학교ID
  name text not null,
  category text,                            -- 초/중/고 (학교급구분)
  sido text,
  address text,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.poi_stations (
  id bigint generated always as identity primary key,
  source_key text not null unique,          -- 표준데이터 역사ID
  name text not null,
  line text,                                -- 노선명
  operator text,                            -- 운영기관
  address text,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

-- 근접 조회는 bbox(lat·lng 범위) 필터로 시작한다 — btree 두 개로 충분한 규모
-- (학교 ~1.2만 행, 역 ~1천 행).
create index if not exists poi_schools_lat_idx on public.poi_schools (lat);
create index if not exists poi_schools_lng_idx on public.poi_schools (lng);
create index if not exists poi_stations_lat_idx on public.poi_stations (lat);
create index if not exists poi_stations_lng_idx on public.poi_stations (lng);

alter table public.poi_schools enable row level security;
alter table public.poi_stations enable row level security;
-- 정책 없음 = deny-all (service_role 은 RLS 미적용)
