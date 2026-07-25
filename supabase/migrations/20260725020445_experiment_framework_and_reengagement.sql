-- A7 실험(A/B) 프레임워크 + B9 이탈 사용자 리마인드 기반 스키마
--
-- 원격에 이미 적용됨 (schema_migrations.version = 20260725020445).
-- 이 파일은 그 사본이다 — supabase/migrations/README.md 참고.
--
-- 설계 메모 (왜 이렇게 했는지):
--
-- 1) 노출/전환 이벤트는 새 표를 만들지 않고 기존 platform_activity_events 에
--    experiment_key / variant 두 컬럼만 더한다. 퍼널 이벤트가 이미 전부 이 표로
--    들어오므로, 별도 표를 만들면 "실험 전환"과 "실제 퍼널"이 갈라져 서로 안 맞는
--    숫자가 두 벌 생긴다.
--
-- 2) experiment_assignments 는 배정을 **기록**하기 위한 표다. 배정 자체는 결정론적
--    해시라서 표가 없어도 재현되지만, 실험 도중 가중치를 바꾸면 같은 사람이 다른
--    통에 들어간다. 그때 조용히 결과가 오염되는 대신 "이 subject 는 예전에 B 였는데
--    지금 A 로 잡힌다"를 사후에 알아낼 수 있어야 한다.
--
-- 3) 두 뷰는 PostgREST 가 GROUP BY 를 못 하기 때문에 존재한다. 둘 다
--    security_invoker = on 으로 만들고 anon/authenticated 권한을 회수한다 —
--    실험 결과와 사용자 마지막 활동 시각은 관리자/크론(service_role)만 본다.
--
-- 4) reengagement_log 는 재알림 쿨다운의 근거다. 이게 없으면 크론이 매일 같은
--    사람에게 같은 알림을 보낸다.

-- ── 1. 이벤트에 실험 태그 ──────────────────────────────────────────────
alter table public.platform_activity_events
  add column if not exists experiment_key text,
  add column if not exists variant text;

-- 실험 결과 집계 전용 부분 인덱스. experiment_key 가 있는 행은 전체의 극히 일부라
-- 부분 인덱스로 만들어 기존 쓰기 경로에 부담을 주지 않는다.
create index if not exists platform_activity_events_experiment_idx
  on public.platform_activity_events (experiment_key, variant, event_name, created_at desc)
  where experiment_key is not null;

-- ── 2. 배정 기록 ───────────────────────────────────────────────────────
create table if not exists public.experiment_assignments (
  id uuid primary key default gen_random_uuid(),
  experiment_key text not null,
  subject_key text not null,
  subject_kind text not null default 'anon' check (subject_kind in ('user', 'anon')),
  variant text not null,
  assigned_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  exposure_count integer not null default 1,
  unique (experiment_key, subject_key)
);

create index if not exists experiment_assignments_key_variant_idx
  on public.experiment_assignments (experiment_key, variant);

alter table public.experiment_assignments enable row level security;
revoke all on public.experiment_assignments from anon, authenticated;
grant all on public.experiment_assignments to service_role;

-- ── 3. 실험 결과 집계 뷰 ───────────────────────────────────────────────
create or replace view public.experiment_results_source
with (security_invoker = on) as
select
  e.experiment_key,
  e.variant,
  e.event_name,
  count(*)::bigint as event_count,
  count(distinct e.user_email) filter (where e.user_email is not null)::bigint as user_count,
  min(e.created_at) as first_at,
  max(e.created_at) as last_at
from public.platform_activity_events e
where e.experiment_key is not null
  and e.variant is not null
group by e.experiment_key, e.variant, e.event_name;

revoke all on public.experiment_results_source from anon, authenticated;
grant select on public.experiment_results_source to service_role;

-- ── 4. 사용자별 마지막 활동 시각 ───────────────────────────────────────
create or replace view public.user_last_activity_source
with (security_invoker = on) as
select
  lower(btrim(e.user_email)) as user_email,
  max(e.created_at) as last_seen_at,
  count(*)::bigint as event_count
from public.platform_activity_events e
where e.user_email is not null
  and btrim(e.user_email) <> ''
group by lower(btrim(e.user_email));

revoke all on public.user_last_activity_source from anon, authenticated;
grant select on public.user_last_activity_source to service_role;

-- ── 5. 재알림 발송 기록 (쿨다운 근거) ──────────────────────────────────
create table if not exists public.reengagement_log (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  reason text not null,
  channels text[] not null default '{}',
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now()
);

create index if not exists reengagement_log_email_sent_idx
  on public.reengagement_log (lower(btrim(user_email)), sent_at desc);

alter table public.reengagement_log enable row level security;
revoke all on public.reengagement_log from anon, authenticated;
grant all on public.reengagement_log to service_role;

-- ── 6. 재알림 수신 설정 ────────────────────────────────────────────────
-- 기본값 true: 이 알림은 광고가 아니라 "본인이 쓰다 만 본인 기록"을 알리는 것이다.
-- 끄고 싶은 사람은 알림 설정에서 끌 수 있다.
alter table public.notification_preferences
  add column if not exists push_reengagement boolean not null default true;
