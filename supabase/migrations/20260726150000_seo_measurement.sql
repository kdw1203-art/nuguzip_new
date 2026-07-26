-- N5 · N25 — SEO 측정 주간 기록 (추가 전용 · 지우는 것 없음).
--
-- ── 왜 두 표를 같이 만드는가 ───────────────────────────────────────────────
-- 둘 다 "지금 우리 사이트가 검색에서 어떤 상태인가"를 **감이 아니라 기록으로**
-- 말하기 위한 표다. 하나는 실사용자 성능(CrUX), 하나는 색인률(서치콘솔)이고,
-- 둘 다 주 단위로 한 행씩 쌓인다. 화면(/admin/seo)이 둘을 한 페이지에 붙여
-- 보여 주므로 표도 같은 규칙으로 둔다.
--
-- ── "값 없음"을 0 으로 적지 않는 이유 ─────────────────────────────────────
-- CrUX 는 트래픽이 일정 수준을 넘어야 데이터를 준다. 그 전에는 API 가 404
-- (CHROME_UX_REPORT_NOT_FOUND)를 돌려준다. 이걸 "LCP 0ms" 로 적으면 대시보드가
-- 세상에서 가장 빠른 사이트를 그린다. 그래서 status 컬럼을 따로 두고 수치는
-- 전부 nullable 로 둔다 — 없는 값은 없는 채로 남긴다.
-- 같은 이유로 색인률도 표본 수(sampled)를 반드시 같이 적는다. 분모 없는 비율은
-- 숫자가 아니라 인상이다.
--
-- 쓰는 곳: /api/cron/crux-sync · /api/cron/gsc-index-sync (쓰기)
--          /admin/seo (읽기)

-- ── N5 · CrUX 실사용자 성능 주간 기록 ─────────────────────────────────────
create table if not exists public.seo_field_perf (
  -- KST 기준 그 주의 월요일. market_temperature_snapshot 과 같은 키 규칙이라
  -- 주간 지표끼리 그대로 조인된다.
  collected_week date not null,
  -- 'origin' = 사이트 전체 집계, 그 외에는 관측한 경로("/", "/region/gangnam" …).
  -- 경로를 그대로 키로 쓰면 나중에 대상이 늘어도 스키마를 안 건드린다.
  target       text not null,
  -- 'PHONE' | 'DESKTOP' | 'ALL' — CrUX 의 formFactor 원문.
  form_factor  text not null check (form_factor in ('PHONE', 'DESKTOP', 'ALL')),

  -- 'ok'                = 수치를 받았다
  -- 'insufficient_data' = CrUX 표본 미달(404). 장애가 아니라 정상적인 "아직 없음".
  -- 'error'             = 호출 자체가 실패했다. 위 둘과 절대 섞지 않는다.
  status       text not null check (status in ('ok', 'insufficient_data', 'error')),
  error_detail text,

  -- p75 = CrUX 가 공식적으로 쓰는 기준값(75번째 백분위수).
  lcp_p75_ms  int,
  inp_p75_ms  int,
  fcp_p75_ms  int,
  ttfb_p75_ms int,
  cls_p75     numeric(6, 3),

  -- "good" 구간 비율(0~100). Core Web Vitals 합격 판정은 p75 로 하지만,
  -- 분포를 같이 남겨야 "간신히 통과"와 "여유 있게 통과"를 구분할 수 있다.
  lcp_good_pct numeric(5, 2),
  inp_good_pct numeric(5, 2),
  cls_good_pct numeric(5, 2),

  -- CrUX 응답의 collectionPeriod. 이 값이 없으면 "이번 주 수치"라고 적어 둔 것이
  -- 실제로 어느 28일을 본 것인지 알 수 없다.
  period_first_date date,
  period_last_date  date,

  observed_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),

  constraint seo_field_perf_pkey primary key (collected_week, target, form_factor)
);

create index if not exists seo_field_perf_week_idx
  on public.seo_field_perf (collected_week desc, target);

comment on table public.seo_field_perf is
  'N5 — Chrome UX Report(CrUX) 실사용자 성능 주간 기록. 키는 KST 기준 그 주의 월요일. status=insufficient_data 는 표본 미달이며 0 이 아니다.';

-- ── N25 · 색인률 주간 기록 ────────────────────────────────────────────────
create table if not exists public.seo_index_coverage (
  collected_week date not null,

  -- 우리 사이트맵이 실제로 싣고 있는 URL 수. 서치콘솔이 되돌려 주는 숫자가 아니라
  -- **우리가 생성한 값**을 쓴다. 우리 쪽 값이 정의상 정확하고, 서치콘솔의 제출 수는
  -- 마지막 크롤 시점에 묶여 있어 오늘 상태와 어긋난다.
  submitted int not null,
  -- URL 검사 API 로 실제 확인한 URL 수. 할당량(2,000/일) 때문에 전수가 아니라 표본이다.
  -- 이 값을 화면에 반드시 같이 띄운다 — 분모 없는 색인률은 숫자가 아니라 인상이다.
  sampled   int not null,
  indexed     int not null,
  not_indexed int not null,
  -- 검사 자체가 실패한 URL 수(할당량 초과·네트워크). 미색인으로 세면 색인률이
  -- 장애 때마다 떨어지는 것처럼 보인다.
  errored     int not null default 0,

  -- 사이트맵 유형별 내역: { "complexes": {"submitted":5147,"sampled":4,"indexed":3}, ... }
  by_section  jsonb not null default '{}'::jsonb,
  -- coverageState 원문 분포: { "Submitted and indexed": 31, "Crawled - currently not indexed": 5, ... }
  -- 색인이 안 되는 **이유**는 여기에만 남는다. 비율만 보면 무엇을 고쳐야 할지 모른다.
  coverage_states jsonb not null default '{}'::jsonb,

  observed_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),

  constraint seo_index_coverage_pkey primary key (collected_week)
);

comment on table public.seo_index_coverage is
  'N25 — 사이트맵 제출 수 대비 색인 수 주간 기록. indexed 는 URL 검사 API 표본(sampled) 기준 실측이며 전수가 아니다.';

-- 다른 운영 표와 같은 규칙: RLS 를 켜고 anon/authenticated 직접 접근은 막는다.
-- 이 두 표는 공개용이 아니라 운영 지표라 공개 경로 자체가 없다(/admin 만 읽는다).
alter table public.seo_field_perf enable row level security;
revoke all on public.seo_field_perf from anon, authenticated;
grant all on public.seo_field_perf to service_role;

alter table public.seo_index_coverage enable row level security;
revoke all on public.seo_index_coverage from anon, authenticated;
grant all on public.seo_index_coverage to service_role;
