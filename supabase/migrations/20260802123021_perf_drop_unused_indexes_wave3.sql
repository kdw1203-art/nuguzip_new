-- ============================================================
-- 항목 30 · 3차 — 미사용 인덱스 정리 (쓰기 잦은 표 우선, 코드 경로 대조 완료)
-- (원격 적용 완료 2026-08-02)
--
-- 판단 근거 (pg_stat idx_scan=0 + 코드 전수 대조):
--  - complex_geocode_ok_idx: region_name 부분 인덱스 — PK(region_name, complex_name)
--    접두가 같은 조회를 이미 담당(328KB, 최대 낭비분).
--  - onbid_sido_idx: 코드는 sido 를 ILIKE '%…%' 로만 검색 — btree 무용.
--  - news_articles_region_idx·published_at_idx: news_articles 를 읽는 코드 경로
--    없음(노출은 board_posts 미러로만). board_post_id_idx 는 FK 지원으로 유지.
--  - board_posts_feed_updated_idx: updated_at 정렬 쿼리 없음(피드는 created_at —
--    feed_created_idx 가 담당, 실사용 확인).
--  - board_posts_geo_idx: board_posts 를 좌표로 거르는 코드 없음.
--  - board_posts_automation_idx: (is_automated, category …) 필터 코드 없음.
--  - board_posts_source_published_at_idx: source_published_at 정렬 코드 없음.
--  - board_posts_external_key_uidx: 전체 UNIQUE(external_key_key)와 중복인
--    부분 UNIQUE — upsert onConflict 는 전체 UNIQUE 가 담당.
--
-- 되돌림(rollback):
--   CREATE INDEX complex_geocode_ok_idx ON public.complex_geocode (region_name)
--     WHERE status = 'ok' AND lat IS NOT NULL AND lng IS NOT NULL;
--   CREATE INDEX onbid_sido_idx ON public.onbid_auctions (sido);
--   CREATE INDEX news_articles_region_idx ON public.news_articles (region);
--   CREATE INDEX news_articles_published_at_idx ON public.news_articles (published_at DESC);
--   CREATE INDEX board_posts_feed_updated_idx ON public.board_posts (board_type, is_published, updated_at DESC);
--   CREATE INDEX board_posts_geo_idx ON public.board_posts (latitude, longitude);
--   CREATE INDEX board_posts_automation_idx ON public.board_posts (is_automated, board_type, category, created_at DESC);
--   CREATE INDEX board_posts_source_published_at_idx ON public.board_posts (source_published_at DESC);
--   CREATE UNIQUE INDEX board_posts_external_key_uidx ON public.board_posts (external_key) WHERE external_key IS NOT NULL;
-- ============================================================

DROP INDEX IF EXISTS public.complex_geocode_ok_idx;
DROP INDEX IF EXISTS public.onbid_sido_idx;
DROP INDEX IF EXISTS public.news_articles_region_idx;
DROP INDEX IF EXISTS public.news_articles_published_at_idx;
DROP INDEX IF EXISTS public.board_posts_feed_updated_idx;
DROP INDEX IF EXISTS public.board_posts_geo_idx;
DROP INDEX IF EXISTS public.board_posts_automation_idx;
DROP INDEX IF EXISTS public.board_posts_source_published_at_idx;
DROP INDEX IF EXISTS public.board_posts_external_key_uidx;
