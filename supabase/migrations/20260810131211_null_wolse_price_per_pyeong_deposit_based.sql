-- 월세(월세액>0) 행의 price_per_pyeong_krw 를 비운다 — 221,420행 (2026-08-10 실측).
--
-- 이 값은 보증금÷평이었다(lib/market/molit-transactions.ts 의 예전 toRow).
-- 보증금 3천/월 180 짜리 집이 "평당 1.2만원"으로 기록되는 식이다 — 월세가
-- 전혀 반영되지 않은 거짓 평단가. 월세를 반영하려면 전월세 환산율을 지어내야
-- 하므로 계산하지 않는 것이 정직하다(몰라서 비움 > 틀리게 채움).
-- 지금 화면(complex-transactions.ts toRecord)은 이 값을 노출하지 않지만,
-- 전월세를 시세 화면에 올리는 순간 그대로 드러날 예정 결함이었다.
-- 전세(월세 0) 행은 보증금이 곧 가격이므로 건드리지 않는다.
-- 적재 경로 2곳(molit cron·admin CSV)도 같은 날 같은 규칙으로 고쳤다.
--
-- 적용: 2026-08-10 13:12 UTC, MCP apply_migration (원격 선적용 → 이 파일은 미러).
-- 적용 호출은 60초에서 클라이언트만 끊겼고 서버는 완주했다 — 원장 행과
-- 잔여 0건을 실측으로 확인한 뒤 이 미러를 남긴다.
--
-- 되돌리기 (값은 보증금·면적에서 결정적으로 재계산된다 — 정보 손실 없음):
--   update public.market_transactions
--      set price_per_pyeong_krw = round(deposit_krw / (area_m2 / 3.305785))
--    where transaction_type = 'rent' and coalesce(monthly_rent_krw, 0) > 0
--      and price_per_pyeong_krw is null
--      and coalesce(deposit_krw, 0) > 0 and coalesce(area_m2, 0) > 0;
update public.market_transactions
   set price_per_pyeong_krw = null
 where transaction_type = 'rent'
   and coalesce(monthly_rent_krw, 0) > 0
   and price_per_pyeong_krw is not null;
