-- [949 · 대규모 최적화] market_transactions 커버링 인덱스 4종 — 지역·단지 조회를 인덱스 전용 스캔으로.
--
-- 실측(2026-09-02, EXPLAIN ANALYZE, 운영 DB):
--   지역 최근 실거래(region_name = ANY, trade, apartment, ORDER BY contract_ym DESC LIMIT 1000)
--     334ms (Index Scan market_transactions_region_recent_idx + 힙 1,703행 · read 367 블록)
--     → 2.0ms (Index Only Scan mt_trade_region_recent_cov2_idx · Heap Fetches 25)
--   지역 전월세 스냅샷(region_name = ANY, rent, contract_ym >= …, deposit NOT NULL LIMIT 5000)
--     평균 647ms(pgss 4주) → 10ms (Index Only Scan mt_rent_region_ym_cov_idx)
--   단지 대표행(region, complex, trade, ORDER BY build_year LIMIT 1)
--     5.8ms 힙 131행 → 2.7ms Heap Fetches 0 (mt_trade_complex_cov_idx)
--   단지 전월세 24개월(region, complex, rent, contract_ym >= …)
--     9.1ms(576행 힙) → 0.6ms (mt_rent_complex_ym_cov_idx)
--
-- 왜 예전 커버링 인덱스(market_transactions_region_recent_cov_idx)가 안 먹었나:
--   TX_SELECT(lib/market/complex-transactions.ts)가 price_per_pyeong_krw 를 함께 읽는데
--   INCLUDE 에 그 컬럼이 없어 힙을 가야 했고, 그러면 계획기는 더 작은 비커버링
--   인덱스를 골랐다. 새 인덱스는 TX_SELECT 의 열을 전부 담는다.
--
-- 교체: 아래 세 개는 새 인덱스가 완전히 대신하므로 지웠다(총 72MB 회수, 신규 4종 174MB).
--   market_transactions_region_recent_cov_idx (50MB) → mt_trade_region_recent_cov2_idx
--   market_transactions_active_trade_idx (11MB, (complex,region,ym))  → mt_trade_complex_cov_idx
--   mt_rent_complex_ym_idx (11MB)                       → mt_rent_complex_ym_cov_idx
--   (market_transactions_region_recent_idx 는 is_cancelled 조건 없는 조회가 쓰므로 남긴다.)
--
-- 운영에는 CONCURRENTLY 로 이미 적용됨(2026-09-02 12:30~12:40Z). 이 파일은 기록용.
create index if not exists mt_trade_complex_cov_idx
  on public.market_transactions (region_name, complex_name, contract_ym desc)
  include (contract_day, deal_amount_krw, area_m2, floor, build_year, address, price_per_pyeong_krw)
  where transaction_type = 'trade' and is_cancelled = false;

create index if not exists mt_trade_region_recent_cov2_idx
  on public.market_transactions (region_name, transaction_type, property_type, contract_ym desc, contract_day desc nulls last)
  include (complex_name, address, deal_amount_krw, area_m2, floor, build_year, price_per_pyeong_krw)
  where deal_amount_krw is not null and is_cancelled = false;

create index if not exists mt_rent_region_ym_cov_idx
  on public.market_transactions (region_name, contract_ym desc)
  include (complex_name, property_type, deposit_krw, monthly_rent_krw, area_m2)
  where transaction_type = 'rent' and is_cancelled = false and deposit_krw is not null;

create index if not exists mt_rent_complex_ym_cov_idx
  on public.market_transactions (region_name, complex_name, contract_ym desc)
  include (property_type, deposit_krw, monthly_rent_krw, area_m2)
  where transaction_type = 'rent' and is_cancelled = false;

drop index if exists public.market_transactions_region_recent_cov_idx;
drop index if exists public.market_transactions_active_trade_idx;
drop index if exists public.mt_rent_complex_ym_idx;
