-- [AI-29] 경제지표 임계 알림 등록 표. 서비스 롤 전용(deny-all RLS) — 접근은 API 경유.
-- (MCP apply_migration 'wave9_economy_watches' 미러 — 2026-08-23)
create table if not exists public.economy_watches (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  metric text not null default 'base_rate',
  threshold numeric not null,
  direction text not null check (direction in ('above','below')),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (user_email, metric, direction)
);
alter table public.economy_watches enable row level security;
-- 정책 없음 = deny-all (service_role 만 통과) — 프로젝트 표준 패턴
