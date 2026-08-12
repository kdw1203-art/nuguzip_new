-- 2026-08-12: payments.billing 에 'weekly' 허용 — 플러스 주간권(7일 1,100원, 단건).
-- 운영자 확정(토스 심사 회신 A-1): 1회성 단건 결제 상품으로 주간권을 판다.
-- 롤백: alter table public.payments drop constraint payments_billing_check;
--       alter table public.payments add constraint payments_billing_check
--         check (billing = any (array['monthly'::text,'annual'::text]));
--       (롤백 전 weekly 행이 있으면 위 제약 추가가 실패한다 — 데이터 확인 필수)
alter table public.payments drop constraint payments_billing_check;
alter table public.payments add constraint payments_billing_check
  check (billing = any (array['weekly'::text, 'monthly'::text, 'annual'::text]));