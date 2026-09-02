-- [947 최적화] mt_rent_agg_ym_cov_idx 제거 — 4주(08-04~09-02) idx_scan 0 실측.
-- rent-yield 라이브 집계용이었으나 ops.rent_yield_cache(pg_cron 야간 갱신)가 경로를
-- 대체했고, 직전 갱신(09-01 22:41Z)도 이 인덱스 없이 성공. market_transactions 는
-- 4주 52만 행 쓰기 — 29MB 인덱스의 쓰기 유지비만 나가던 상태였다.
-- (라이브 적용: 2026-09-02 MCP migration drop_unused_rent_agg_index)
-- 복원 DDL(필요 시):
-- CREATE INDEX mt_rent_agg_ym_cov_idx ON public.market_transactions USING btree (contract_ym)
--   INCLUDE (region_name, deposit_krw, monthly_rent_krw)
--   WHERE transaction_type='rent' AND property_type='apartment' AND is_cancelled=false AND deposit_krw IS NOT NULL;
drop index if exists public.mt_rent_agg_ym_cov_idx;
