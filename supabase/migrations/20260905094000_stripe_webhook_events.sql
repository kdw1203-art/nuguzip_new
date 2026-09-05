-- [965] Stripe 웹훅 재전송 선점(dedup) 표.
--
-- app/api/billing/webhook/route.ts 는 event.id 를 이 표에 insert 해 23505(중복)면
-- 재처리를 건너뛰도록 짜여 있었는데, 표가 어느 마이그레이션에도 없었다 — insert 가
-- 늘 42P01 로 실패했고 그 실패는 warn 한 줄로 삼켜져 "선점" 은 한 번도 동작한 적이
-- 없다. Stripe 는 at-least-once 전송이라 같은 이벤트가 두 번 올 수 있다.
-- service_role 전용(RLS on · 정책 없음). 가산만·재실행 안전.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text,
  received_at timestamptz not null default now()
);

comment on table public.stripe_webhook_events is
  '[965] Stripe 웹훅 event.id 선점 — 같은 이벤트 재전송을 한 번만 처리한다. service_role 전용.';

alter table public.stripe_webhook_events enable row level security;

revoke all on table public.stripe_webhook_events from anon;
revoke all on table public.stripe_webhook_events from authenticated;
