-- ============================================================
-- 누구집 (nuguzip.com) 초기 스키마
-- 핵심 흐름: 임장 기록 → AI 분석 → 판단 (비교·협상·청약)
-- ============================================================

-- 사용자 프로필 (가입 시 수집 — 추천·계산기·청약 전략에 주입)
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  age_band text,            -- '20s' | '30s' | '40s' | '50s+'
  gender text,              -- 'male' | 'female' | 'na'
  household text,           -- '1인' | '신혼' | '자녀' | '다세대'
  job text,
  first_home boolean default true,     -- 생애최초 여부
  owned_homes int default 0,           -- 보유 주택 수
  interest_regions text[] default '{}',-- 관심지역 → 홈 개인화·지도 초기 위치
  plan text default 'free',            -- 'free' | 'plus' | 'pro'
  created_at timestamptz default now()
);

-- 단지
create table if not exists complexes (
  id bigint generated always as identity primary key,
  name text not null,
  region text not null,          -- 시군구
  dong text,                     -- 동
  built_year int,
  households int,
  parking_per_household numeric,
  lat double precision,
  lng double precision,
  created_at timestamptz default now()
);

-- 임장노트 (회차 기록, 로그인 없이 작성 → 저장 시 로그인)
create table if not exists notes (
  id bigint generated always as identity primary key,
  user_id uuid references profiles (id) on delete cascade,
  complex_id bigint references complexes (id) on delete set null,
  title text not null,
  visit_no int default 1,                 -- 다회차 비교용 회차
  content text,
  checklist jsonb default '{}'::jsonb,    -- 채광/소음/주차/경사 등 세그먼트 평가
  photos text[] default '{}',
  tags text[] default '{}',               -- '채광 좋음' '주차 아쉬움' 등
  score int,                              -- AI 종합 점수
  visibility text default 'private',      -- 'private' | 'public' (공개 시 동·호수 자동 가림)
  visited_at date,
  created_at timestamptz default now()
);

-- AI 분석 결과 (노트/단지/비교 리포트 — 항상 잉크 다크 패널로 표시)
create table if not exists ai_reports (
  id bigint generated always as identity primary key,
  user_id uuid references profiles (id) on delete cascade,
  kind text not null,             -- 'note' | 'complex' | 'compare' | 'price' | 'cycle'
  subject jsonb not null,         -- 대상 (note_id, complex_ids 등)
  result jsonb not null,          -- 판단 근거·점수·신뢰구간
  created_at timestamptz default now()
);

-- 후보 단지 비교 목록 (최대 5)
create table if not exists compare_lists (
  user_id uuid references profiles (id) on delete cascade,
  complex_id bigint references complexes (id) on delete cascade,
  added_at timestamptz default now(),
  primary key (user_id, complex_id)
);

-- 동네이야기 커뮤니티 글
create table if not exists posts (
  id bigint generated always as identity primary key,
  user_id uuid references profiles (id) on delete cascade,
  category text not null,        -- '임장후기' | '질문' | '뉴스' | '자료'
  title text not null,
  content text,
  region text,
  likes int default 0,
  created_at timestamptz default now()
);

create table if not exists comments (
  id bigint generated always as identity primary key,
  post_id bigint references posts (id) on delete cascade,
  user_id uuid references profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

-- 실거래 스냅샷 (국토부 공개 데이터 캐시)
create table if not exists trades (
  id bigint generated always as identity primary key,
  complex_id bigint references complexes (id) on delete cascade,
  price_100m numeric not null,   -- 억 단위
  area_m2 numeric,
  floor int,
  traded_at date not null
);

-- 알림 설정 (조건 빌더) & 알림함
create table if not exists alert_rules (
  id bigint generated always as identity primary key,
  user_id uuid references profiles (id) on delete cascade,
  name text not null,
  condition jsonb not null,      -- {region, price_lte, drop_gte_pct, ...}
  channels text[] default '{push}',
  enabled boolean default true,
  created_at timestamptz default now()
);

create table if not exists notifications (
  id bigint generated always as identity primary key,
  user_id uuid references profiles (id) on delete cascade,
  kind text not null,            -- 'price' | 'note' | 'community' | 'system'
  title text not null,
  body text,
  read boolean default false,
  created_at timestamptz default now()
);

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table notes enable row level security;
alter table ai_reports enable row level security;
alter table compare_lists enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table alert_rules enable row level security;
alter table notifications enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own notes" on notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public notes readable" on notes
  for select using (visibility = 'public');

create policy "own reports" on ai_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own compare list" on compare_lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "posts readable" on posts for select using (true);
create policy "own posts" on posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "comments readable" on comments for select using (true);
create policy "own comments" on comments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own alert rules" on alert_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own notifications" on notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 공개 데이터 (단지·실거래)는 익명 읽기 허용
alter table complexes enable row level security;
alter table trades enable row level security;
create policy "complexes readable" on complexes for select using (true);
create policy "trades readable" on trades for select using (true);
