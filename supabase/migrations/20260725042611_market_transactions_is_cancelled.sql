-- #150 — 해제(취소) 실거래를 실거래로 세지 않기 위한 플래그.
--
-- 원격 DB 에 이미 적용된 마이그레이션의 사본이다(supabase/migrations/README.md 규약).
-- version 20260725042611 = supabase_migrations.schema_migrations 의 값과 정확히 일치.
--
-- 사실: 국토부 RTMS 응답의 cdealType 은 정상거래에서 " "(공백 한 칸), 해제신고된
-- 계약에서 "O" 다. 적재 코드(molit-transactions.ts, admin/molit-csv)는 이 값을
-- raw 에 담기만 하고 한 번도 보지 않았다. 그래서 2026-07-25 기준 매매 22,869행 중
-- 402행(1.76%)의 "없던 일이 된 계약"이 평균가·구간집계·알림가에 그대로 섞여 있다.
--
-- 왜 컬럼인가: raw->>'cdealType' 로 매번 거르면 (1) PostgREST 필터 표현이 지저분하고
-- (2) 인덱스를 못 태우며 (3) CSV·API 등 소스마다 키 이름이 달라질 때 조건이 흩어진다.
-- 판정은 적재 시점에 한 번만 하고, 읽는 쪽은 boolean 하나만 본다.
--
-- 파괴적이지 않다: 컬럼 추가 + 백필뿐이고 해제 거래 행 자체는 지우지 않는다.
-- (해제 이력은 그 자체로 의미 있는 데이터이고, 나중에 "해제된 거래" 화면을 만들 수 있다.)

alter table public.market_transactions
  add column if not exists is_cancelled boolean not null default false;

comment on column public.market_transactions.is_cancelled is
  '국토부 해제(취소) 신고 거래 여부 — raw->>cdealType = ''O''. 시세·집계·알림에서 제외한다.';

update public.market_transactions
   set is_cancelled = true
 where is_cancelled = false
   and btrim(coalesce(raw ->> 'cdealType', '')) = 'O';

-- 시세/알림 경로(complex_name + region_name + 최신순)의 정상거래만 훑는 부분 인덱스.
create index if not exists market_transactions_active_trade_idx
  on public.market_transactions (complex_name, region_name, contract_ym desc)
  where is_cancelled = false and transaction_type = 'trade';
