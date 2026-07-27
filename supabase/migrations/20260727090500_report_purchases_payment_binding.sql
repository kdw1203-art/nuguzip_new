-- 리포트 구매 ↔ 결제 1:1 결속 — report_purchases.payment_id
--
-- 발견한 사실 두 가지.
--
-- 1) payment_id 는 uuid 였는데, 앱 코드는 uuid 가 아닌 값을 넣고 있었다:
--      · app/api/reports/[id]/purchase   → `${orderId}:${paymentId}`
--      · app/api/reports/[id]/purchase   → `plan-benefit-${plan}`
--      · app/api/creator/reports/[id]/buy → `points:${id}`
--    셋 다 22P02(invalid input syntax for type uuid) 로 insert 가 실패했다.
--    포인트 구매 경로는 spendPoints 로 **먼저 차감한 뒤** 이 insert 를 하므로,
--    사용자는 포인트만 잃고 리포트는 못 받는다. 그래서 컬럼을 text 로 바꾼다
--    (테이블 0행 — 데이터 손실 없음). payments 로 가던 FK 도 함께 사라지는데,
--    payment_id 가 이제 uuid 뿐 아니라 `points:`·`plan-benefit-` 같은 비결제
--    출처도 담으므로 FK 로 강제할 수 있는 관계가 아니다.
--
-- 2) 결제 1건으로 리포트를 무제한 열 수 있었다. 구매 라우트는 결제가 존재하고
--    paid 이고 본인 것인지만 봤을 뿐, **그 결제가 어느 리포트를 위한 것인지**와
--    **이미 썼는지**를 보지 않았다. 앱 쪽에서는 payments.metadata.reportId 대조로,
--    DB 쪽에서는 아래 유니크 인덱스로 막는다 — 같은 결제 식별자는 한 번만 쓰인다.

alter table public.report_purchases
  drop constraint if exists report_purchases_payment_id_fkey;

alter table public.report_purchases
  alter column payment_id type text using payment_id::text;

-- 같은 결제(또는 포인트 참조)로 두 번 구매 기록이 생기지 않게. NULL 은 여러 개
-- 허용되므로(결제 없는 과거 기록) 기존 행에는 영향이 없다.
create unique index if not exists report_purchases_payment_id_key
  on public.report_purchases (payment_id)
  where payment_id is not null;
