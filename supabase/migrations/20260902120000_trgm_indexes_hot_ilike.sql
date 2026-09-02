-- [948 · 최적화 2차] 단지 허브 렌더마다 도는 ILIKE 조회 3종에 trigram GIN 인덱스.
--
-- 실측(2026-09-02, pg_stat_statements 00:06Z→11:41Z 델타):
--   board_posts (title ILIKE OR ai_summary ILIKE) AND is_automated
--     4,408회 · 평균 26.6ms · seq scan(772 buffers, 811행 필터 제거)
--     → 인덱스 후 EXPLAIN ANALYZE 1.3ms (BitmapOr 두 trigram 인덱스)
--   apartment_supply address ILIKE
--     6,035회 · 평균 10.6ms · seq scan
--
-- 둘 다 lib/ai/live-context.ts(단지 허브 축 요약)가 단지 렌더마다 부른다.
-- 호출 횟수 자체는 948 코드(지역 단위 캐시)가 줄이고, 여기서는 남는 호출의
-- 단가를 줄인다. CONCURRENTLY 로 이미 운영 DB 에 적용됐다(2026-09-02 11:50Z) —
-- 이 파일은 기록용이며 IF NOT EXISTS 라 재실행해도 무해하다.
create index if not exists board_posts_title_trgm_idx
  on public.board_posts using gin (title gin_trgm_ops);
create index if not exists board_posts_ai_summary_trgm_idx
  on public.board_posts using gin (ai_summary gin_trgm_ops);
create index if not exists apartment_supply_address_trgm_idx
  on public.apartment_supply using gin (address gin_trgm_ops);
