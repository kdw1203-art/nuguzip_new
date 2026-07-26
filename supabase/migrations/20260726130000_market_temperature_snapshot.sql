-- N11 — 시장 온도 주간 스냅샷 (추가 전용 · 지우는 것 없음).
--
-- ── 왜 필요한가 ────────────────────────────────────────────────────────────
-- /analysis/timing 의 "시장 온도"는 지금 이 순간의 값 하나만 보여 준다.
-- 그런데 사람이 실제로 알고 싶어 하는 문장은 "지금 62점"이 아니라
-- "3주 연속 오르고 있다" 쪽이고, 검색·AI 인용도 그런 문장에 붙는다.
-- 시계열이 없으면 그 문장은 지어내는 수밖에 없다 — 그래서 저장한다.
--
-- ── 키를 '그 주의 월요일'로 잡은 이유 ──────────────────────────────────────
-- 크론은 하루 두 번 도는데, 온도를 하루 두 번 저장하면 아카이브가 아니라
-- 로그가 된다. 반대로 "월요일에만 저장"으로 두면 그날 실행이 한 번 실패했을 때
-- 그 주가 통째로 비고, 나중에 메울 방법이 없다(과거 지수·거래량으로 그 시점의
-- 값을 되살릴 수는 있지만 그건 재구성이지 관측이 아니다).
-- 그래서 키를 KST 기준 주의 월요일로 두고 upsert 한다. 매일 돌아도 그 주의 행
-- 하나를 계속 갱신할 뿐이고, 주가 넘어가면 지난주 값은 그대로 굳는다.
-- 즉 저장된 값의 정의는 **"그 주에 마지막으로 관측한 시장 온도"** 다.
-- 화면에도 이 정의를 그대로 적는다 — 정의를 숨기면 숫자가 실제보다 더
-- 정밀한 것처럼 읽힌다.
--
-- ── 공식이 바뀌면 ─────────────────────────────────────────────────────────
-- formula_version 을 같이 저장한다. 계산 규칙을 바꿔도 과거 행은 그 시절
-- 버전을 달고 남으므로, 어느 구간이 다른 공식으로 계산됐는지 나중에 말할 수
-- 있다. 과거를 새 공식으로 다시 칠하지 않는다.
--
-- 원본 계산: lib/market/temperature.ts (페이지와 스냅샷이 같은 코드를 쓴다)
-- 쓰는 곳: /api/cron/market-temperature-snapshot (쓰기)
--          /analysis/temperature · /analysis/temperature/[region] (읽기)
--          /api/public/market/temperature (읽기, N20 공개 JSON)

create table if not exists public.market_temperature_snapshot (
  region_id     text        not null,
  -- KST 기준 그 주의 월요일. date 로 두어 주 단위 정렬·범위 질의가 자연스럽게 된다.
  week_start    date        not null,
  region_label  text        not null,
  score         smallint    not null check (score between 0 and 100),
  headline      text        not null,
  -- 'monthly' | 'weekly' — 지수 시리즈가 월간이었는지 주간 대체였는지.
  -- 이걸 남기지 않으면 나중에 두 종류의 모멘텀을 같은 축에 그리게 된다.
  period_type   text        not null check (period_type in ('monthly', 'weekly')),

  -- 점수를 만든 입력값 원본. 화면 문자열이 아니라 숫자로 남긴다.
  momentum_pct        numeric(10, 4),
  prior_pct           numeric(10, 4),
  momentum_points     numeric(6, 3),
  volume_points       numeric(6, 3),
  volume_window_months smallint,
  volume_recent_count int,
  volume_prior_count  int,
  volume_delta_pct    numeric(10, 4),
  index_latest        numeric(12, 4),
  index_latest_period text,

  formula_version smallint    not null default 1,
  -- 그 주의 값이 마지막으로 갱신된 시각. "언제 관측했는가"를 화면에 적기 위한 것.
  observed_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),

  constraint market_temperature_snapshot_pkey primary key (region_id, week_start)
);

-- 허브 화면은 "모든 지역의 가장 최근 주"를 한 번에 읽는다.
create index if not exists market_temperature_snapshot_week_idx
  on public.market_temperature_snapshot (week_start desc, region_id);

comment on table public.market_temperature_snapshot is
  '시장 온도(0~100) 주간 스냅샷. 키는 KST 기준 그 주의 월요일이며, 값은 그 주에 마지막으로 관측한 것. 계산식은 lib/market/temperature.ts.';

-- 다른 운영 테이블과 같은 규칙: RLS 를 켜고 anon/authenticated 의 직접 접근은
-- 막는다. 이 표는 공개 데이터지만, 공개는 **우리 서버 라우트를 거쳐서** 한다
-- (/analysis/temperature, /api/public/market/temperature). 그래야 출처 표기·
-- 캐시 정책·요약 범위를 한 곳에서 지킬 수 있다.
alter table public.market_temperature_snapshot enable row level security;
revoke all on public.market_temperature_snapshot from anon, authenticated;
grant all on public.market_temperature_snapshot to service_role;
