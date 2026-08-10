-- =============================================================================
-- 쿼리 성능 인덱스 — 실측 기반
-- 2026-08-05
--
-- ✅ 프로덕션에 이미 적용 완료 (CREATE INDEX CONCURRENTLY, 무중단).
--    이 파일은 저장소 기록용 사본입니다.
--
-- 근거: pg_stat_statements 상위 쿼리 + EXPLAIN (ANALYZE, BUFFERS) 실측.
--       TTFB 실사용자 지표가 good 1,877 / 개선필요 2,041 / poor 229 로
--       45% 만 양호했던 것의 서버측 원인입니다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) apartment_complexes — 단지 상세 페이지의 1차 조회 (가장 큰 효과)
-- -----------------------------------------------------------------------------
-- 쿼리: WHERE source_key = $1 AND metadata->>'kaptCode' = $2
-- 프로덕션 통계: 1,354회 호출 / 평균 33.3ms
--
-- 문제: metadata 는 jsonb 이고 kaptCode 에 인덱스가 없어,
--       source_key 인덱스로 좁힌 뒤 7,053행을 전부 읽어 jsonb 를 풀어 비교.
--       버퍼 5,700개(약 44MB)를 읽어 1행을 반환.
--
--   BEFORE  Index Scan ... Filter: (metadata ->> 'kaptCode') = 'A10027336'
--           Rows Removed by Filter: 7053
--           Buffers: shared hit=5700          Execution Time: 7.605 ms (warm)
--
--   AFTER   Index Scan using apartment_complexes_kaptcode_idx
--           Buffers: shared hit=3             Execution Time: 0.077 ms
--                                             → 약 100배, 버퍼 1,900배 감소
--
-- ⚠️ 시행착오 기록: 처음엔 `WHERE metadata ? 'kaptCode'` 부분 인덱스로 만들었으나
--    쿼리에 그 조건이 없어 플래너가 쓸 수 없었습니다(부분 인덱스는 쿼리 조건이
--    인덱스 조건을 함의해야 사용 가능). 부분 조건을 빼고 source_key 를 선두
--    컬럼으로 넣어 쿼리와 정확히 맞췄습니다.
CREATE INDEX CONCURRENTLY IF NOT EXISTS apartment_complexes_kaptcode_idx
ON public.apartment_complexes (source_key, (metadata->>'kaptCode'));
-- 크기: 1,016 kB

-- -----------------------------------------------------------------------------
-- 2) complex_geocode — 지도 초기 로드 (거래량 상위 단지)
-- -----------------------------------------------------------------------------
-- 쿼리: WHERE status = 'ok' AND lat IS NOT NULL
--       ORDER BY trade_count DESC NULLS LAST LIMIT $2
-- 프로덕션 통계: 68회 호출 / 평균 76.2ms, 테이블 seq_scan 1,474회
--
-- 문제: 기존 인덱스는 (lat, lng) 키라 trade_count 정렬에 쓸 수 없음.
--       32,275행 전체를 seq scan 한 뒤 top-N 정렬.
--
--   BEFORE  Seq Scan rows=32275 → Sort               Execution Time: 64.216 ms
--   AFTER   Index Only Scan, Heap Fetches: 15
--           Buffers: shared hit=20                   Execution Time: 0.243 ms
--                                                    → 약 264배
--
-- ⚠️ 여기서도 부분 조건을 쿼리보다 좁게(lng IS NOT NULL 포함) 잡았다가
--    사용되지 않았습니다. 쿼리 조건과 동일하게 맞춘 뒤 정상 사용됩니다.
CREATE INDEX CONCURRENTLY IF NOT EXISTS complex_geocode_trade_rank_idx
ON public.complex_geocode (trade_count DESC NULLS LAST)
INCLUDE (region_name, complex_name, lat, lng)
WHERE status = 'ok' AND lat IS NOT NULL;
-- 크기: 2,480 kB

-- -----------------------------------------------------------------------------
-- 3) market_transactions — 지역 실거래 목록
-- -----------------------------------------------------------------------------
-- 쿼리: WHERE region_name = ANY($1) AND transaction_type = $2
--         AND is_cancelled = $3 AND property_type = $4 AND deal_amount_krw IS NOT NULL
--       ORDER BY contract_ym DESC, contract_day DESC NULLS LAST LIMIT $5
-- 프로덕션 통계: 591회 호출(2개 쿼리) / 평균 148.5ms, 146.4ms
--
-- 문제: 기존 market_transactions_region_recent_idx 는 is_cancelled 를 포함하지
--       않고 커버링도 아니어서, Bitmap Heap Scan 으로 9,881행 + 힙 블록 1,873개를
--       읽어 50행만 남기고 버림. 실행 시간의 대부분이 힙 접근.
--
--   BEFORE  Bitmap Heap Scan rows=9881, Heap Blocks: exact=1873
--           Buffers: shared hit=985 read=911         Execution Time: 94.597 ms
--   AFTER   Index Only Scan, Heap Fetches: 0
--           Buffers: shared hit=198                  Execution Time: 6.357 ms
--                                                    → 약 15배, 버퍼 90% 감소
--
-- 설계 메모:
--   * transaction_type / property_type 을 부분 조건이 아니라 키에 둔 이유:
--     둘 다 파라미터라 trade/rent, apartment 등 값이 바뀝니다. 부분 인덱스로
--     고정하면 한쪽만 커버하게 됩니다.
--   * is_cancelled = false 와 deal_amount_krw IS NOT NULL 은 앱이 항상 고정으로
--     넣는 조건이라 부분 조건으로 내려 인덱스를 작게 유지했습니다.
--   * INCLUDE 컬럼은 PostgREST 가 select 하는 컬럼에 맞췄습니다. 여기서 벗어나는
--     컬럼을 추가로 select 하면 Index Only Scan 이 깨지므로, 앱에서 select 목록을
--     바꿀 때 이 인덱스도 함께 보십시오.
CREATE INDEX CONCURRENTLY IF NOT EXISTS market_transactions_region_recent_cov_idx
ON public.market_transactions
  (region_name, transaction_type, property_type, contract_ym DESC, contract_day DESC NULLS LAST)
INCLUDE (complex_name, address, deal_amount_krw, area_m2, floor, build_year)
WHERE deal_amount_krw IS NOT NULL AND is_cancelled = false;
-- 크기: 38 MB (DB 총량 1,084MB → 1,126MB)

-- 통계 갱신 (인덱스 생성 후 필수)
ANALYZE public.apartment_complexes;
ANALYZE public.complex_geocode;
ANALYZE public.market_transactions;

-- =============================================================================
-- 검증 방법
-- =============================================================================
-- 인덱스가 실제로 쓰이는지 (idx_scan 이 증가해야 정상):
--   select indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
--   from pg_stat_user_indexes
--   where indexrelname in ('apartment_complexes_kaptcode_idx',
--                          'complex_geocode_trade_rank_idx',
--                          'market_transactions_region_recent_cov_idx');
--
-- 느린 쿼리 재점검 (1~2주 뒤):
--   select round(mean_exec_time::numeric,1) mean_ms, calls,
--          left(regexp_replace(query, E'\\s+', ' ', 'g'), 120) q
--   from pg_stat_statements
--   where calls > 50 order by total_exec_time desc limit 15;
--
-- 기준선 초기화가 필요하면:  select pg_stat_statements_reset();

-- =============================================================================
-- 후속 검토 (지금은 손대지 않음)
-- =============================================================================
-- * market_transactions_region_recent_idx (4,752 kB) 는 새 커버링 인덱스와
--   키 접두사가 같아 대부분 중복입니다. 다만 is_cancelled = true 쿼리를
--   커버하므로, 2주간 idx_scan 을 관찰한 뒤 0 에 가까우면 DROP 하십시오.
--
-- * ops.refresh_market_aggregates_cron() 는 평균 115초, 최대 231초입니다.
--   내부적으로 REFRESH MATERIALIZED VIEW CONCURRENTLY 를 쓰고 advisory lock 과
--   6시간 신선도 가드까지 갖춰 잘 만들어져 있습니다. 다만
--   public.complex_tx_stats_base 를 누가 갱신하는지는 이 함수 밖입니다.
--   그 경로가 CONCURRENTLY 가 아니면 갱신 중 읽기가 전면 차단되어
--   TTFB 꼬리(최대 1,038ms / 2,279ms 관측)의 원인이 됩니다.
--   complex_tx_stats_pk 유니크 인덱스가 있으므로 CONCURRENTLY 사용 가능합니다.
--
-- * 롤백:
--   DROP INDEX CONCURRENTLY IF EXISTS public.apartment_complexes_kaptcode_idx;
--   DROP INDEX CONCURRENTLY IF EXISTS public.complex_geocode_trade_rank_idx;
--   DROP INDEX CONCURRENTLY IF EXISTS public.market_transactions_region_recent_cov_idx;
