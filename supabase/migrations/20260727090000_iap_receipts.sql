-- 인앱결제 영수증 결속 테이블 — iap_receipts
--
-- 배경: /api/billing/iap/verify 는 스토어 응답의 최상위 status 만 보고
-- "검증됨"으로 판정한 뒤, **클라이언트가 보낸** productId 로 플랜을 올렸다.
-- 그래서 (1) 가장 싼 상품을 사고 productId 만 비싼 등급으로 바꿔 보내면 최상위
-- 등급이 되고, (2) 같은 영수증을 몇 번이든 다시 낼 수 있으며, (3) 로그인만 하면
-- 남의 영수증도 쓸 수 있었다. 스토어가 발급한 거래를 **한 번만·한 계정에만**
-- 붙이려면 거래 식별자를 서버가 기억해야 하고, 그 자리가 이 테이블이다.
--
-- transaction_key:
--   · apple  = original_transaction_id (구독 갱신 전체를 묶는 원 거래 ID)
--   · google = orderId (없으면 purchaseToken)

create table if not exists public.iap_receipts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('apple', 'google')),
  transaction_key text not null,
  product_id text not null,
  user_email text not null,
  expires_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (platform, transaction_key)
);

create index if not exists iap_receipts_user_email_idx
  on public.iap_receipts (user_email, created_at desc);

-- RLS 활성 + 정책 0개 = anon/authenticated 전면 차단(deny-all), 서버(service_role)만 접근.
-- 이 저장소의 결제·감사 계열 테이블이 쓰는 방식 그대로다 — 정책을 추가하면
-- 오히려 접근이 넓어진다(docs/security-audit.md §1 참고).
alter table public.iap_receipts enable row level security;

revoke all on public.iap_receipts from anon, authenticated;
grant select, insert on public.iap_receipts to service_role;
