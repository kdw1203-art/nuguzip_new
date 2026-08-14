-- 2026-08-14: 토스 자동결제(빌링) 구독 원장 + 갱신 크론.
--
-- 문서 근거 (docs.tosspayments.com/guides/v2/billing — 소유자 전달본 2026-08-13):
--  - requestBillingAuth 로 카드를 등록하면 successUrl 에 authKey+customerKey 가 온다.
--    서버가 POST /v1/billing/authorizations/issue 로 billingKey 를 발급받아 저장하고,
--    갱신 결제는 POST /v1/billing/{billingKey} 를 **자체 스케줄링**으로 호출한다
--    (토스는 스케줄러를 제공하지 않는다 — 문서 명시). 그 스케줄러가 이 크론이다.
--  - customerKey 는 유추 불가능한 무작위 고유값이어야 한다(이메일 금지) — uuid 컬럼.
--  - billingKey 는 카드 정보의 대체값이라 클라이언트로 절대 내려보내지 않는다 —
--    RLS 정책 없음(서비스롤 전용)이 그 원칙의 DB 층 구현이다.
--
-- 상태 전이: pending(카드 등록 진행) → active(빌링키 발급+첫 결제 성공)
--            → canceled(사용자 해지) | suspended(연속 실패로 청구 중단)
--            | deleted(BILLING_DELETED 웹훅 — 토스 쪽에서 빌링키 삭제).
--
-- 롤백: select cron.unschedule('billing-renewals');
--       drop function ops.run_billing_renewals();
--       drop table public.billing_subscriptions;
create table if not exists public.billing_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  user_email         text not null,
  -- 토스 customerKey — 서버 발급 무작위 UUID(문서: 이메일 등 유추 가능 값 금지)
  customer_key       uuid not null unique default gen_random_uuid(),
  -- 빌링키 — 발급 전 null. 서비스롤 밖으로 절대 나가지 않는다.
  billing_key        text,
  card_company       text,
  card_number_masked text,
  plan               text not null check (plan in ('pro','expert')),
  -- weekly 는 단건 전용(자동 반복청구 없음 고지) — 자동결제 주기는 월간·연간뿐
  billing            text not null check (billing in ('monthly','annual')),
  -- 갱신 청구액(원) — 활성화 시점 판매가로 고정. 가격 개정은 새 구독부터.
  amount             integer not null check (amount > 0),
  status             text not null default 'pending'
                     check (status in ('pending','active','suspended','canceled','deleted')),
  fail_count         integer not null default 0,
  next_charge_at     timestamptz,
  last_order_id      text,
  last_error         text,
  canceled_at        timestamptz
);

create index if not exists billing_subscriptions_user_email_idx
  on public.billing_subscriptions (user_email);
-- 갱신 크론의 due 조회 경로
create index if not exists billing_subscriptions_due_idx
  on public.billing_subscriptions (next_charge_at)
  where status = 'active';
-- 한 사용자당 청구가 살아 있는 자동결제는 1건 — 코드 실수로 이중 구독이 생겨도
-- DB 가 막는다(활성화 코드는 기존 active/suspended 를 먼저 canceled 로 접는다).
create unique index if not exists billing_subscriptions_one_live_per_user
  on public.billing_subscriptions (user_email)
  where status in ('active','suspended');

alter table public.billing_subscriptions enable row level security;

comment on table public.billing_subscriptions is
  '토스 자동결제(빌링) 구독 원장. customerKey·billingKey 매핑과 갱신 스케줄의 단일 출처. 정책 없는 RLS = 서비스롤 전용.';
comment on column public.billing_subscriptions.billing_key is
  '토스 빌링키 — 카드 정보 대체값. 클라이언트·anon 으로 노출 금지(서비스롤 전용).';

-- 갱신 트리거 — social-upload-drain 과 같은 vault('cron_secret') 패턴.
-- 시크릿 미등록이면 아무것도 하지 않는다(등록 절차: docs/social-shorts-setup.md C절).
create or replace function ops.run_billing_renewals()
returns void
language plpgsql
security definer
set search_path to 'ops','net','vault','pg_catalog'
as $$
declare
  s text;
begin
  select decrypted_secret into s
    from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if s is null then
    return; -- 시크릿 미등록 — 호출해 봐야 403 이다.
  end if;
  perform net.http_post(
    url := 'https://nuguzip.com/api/cron/billing-renewals',
    headers := jsonb_build_object('x-cron-secret', s, 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  );
end;
$$;

revoke all on function ops.run_billing_renewals() from public, anon, authenticated;

-- 하루 2회(10:10·22:10 KST) — 실패 건을 같은 날 안에 한 번 더 재시도한다.
-- 이중 청구는 주기 고정 멱등키(앱 코드)와 결제 원장 재사용 검사가 막는다.
select cron.schedule('billing-renewals', '10 1,13 * * *', $$select ops.run_billing_renewals()$$);