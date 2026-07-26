-- market_agg MV 의 SELECT 권한 복구 (추가 전용 — 지우는 것 없음).
--
-- ── 무슨 일이 있었나 (실측) ────────────────────────────────────────────────
-- 운영에서 /tx 가 "실거래 데이터를 불러오지 못했습니다" 를 띄우고
-- /sitemap-tx.xml 이 503(retry-after: 600, x-vercel-cache: MISS)을 내고 있었다.
-- 앞선 세션의 가설은 "빌드 환경이 Supabase 에 못 붙는다" 였으나 틀렸다.
-- DB 에 직접 물어보니 원인은 네트워크가 아니라 권한이었다.
--
--   set local role anon;
--   select count(*) from public.tx_band_landing_source;
--   → ERROR: 42501: permission denied for materialized view tx_band_landing_mv
--     HINT: GRANT SELECT ON market_agg.tx_band_landing_mv TO anon;
--
--   set local role service_role;   -- 같은 쿼리
--   → ERROR: 42501: permission denied for materialized view tx_band_landing_mv
--     HINT: GRANT SELECT ON market_agg.tx_band_landing_mv TO service_role;
--
-- has_table_privilege 로 전수 확인한 상태:
--
--   tx_band_landing_mv    anon=false  authenticated=false  service_role=false
--   tx_band_complex_mv    anon=false  authenticated=false  service_role=false
--   map_price_point_mv    anon=false  authenticated=false  service_role=false
--   complex_sitemap_mv    anon=false  authenticated=false  service_role=true   ← 유일하게 살아 있던 것
--
--   VIEW public.tx_band_landing_source   anon=true authenticated=true service_role=true
--   VIEW public.tx_band_complex_source   anon=true authenticated=true service_role=true
--   VIEW public.map_price_point_source   anon=true authenticated=true service_role=true
--
-- 바깥 뷰에는 권한이 멀쩡히 붙어 있는데도 읽히지 않는 이유는 이 뷰들이
-- `security_invoker = on` 이기 때문이다. security_invoker 뷰는 뷰 소유자가 아니라
-- **호출한 롤의 권한으로** 아래 객체를 읽는다. 즉 뷰에 GRANT 를 주는 것만으로는
-- 아무 소용이 없고, 호출 롤이 MV 자체에 SELECT 를 들고 있어야 한다.
-- complex_sitemap_mv 만 멀쩡했던 건 20260726034500 이 MV 에 직접 GRANT 를 줬기 때문이고,
-- 그래서 /sitemap-complexes.xml(25,710 URL)만 살아 있었다.
--
-- ── 어디서 사라졌나 ────────────────────────────────────────────────────────
-- 20260725042708_exclude_cancelled_from_market_aggregates.sql 이 취소거래
-- (is_cancelled = false) 필터를 넣으려고 MV 3개를 통째로 갈아엎었다:
--
--   drop materialized view if exists market_agg.tx_band_landing_mv;   (외 2개)
--   create materialized view market_agg.tx_band_landing_mv as ...;
--   ...
--   grant select on public.tx_band_landing_source to anon, authenticated, service_role;
--
-- DROP MATERIALIZED VIEW 는 그 객체에 붙어 있던 GRANT 를 전부 같이 버린다.
-- CREATE OR REPLACE MATERIALIZED VIEW 라는 문법은 없으므로 drop+create 외에
-- 선택지가 없었고, 재생성 뒤 다시 줘야 할 GRANT 를 **바깥 뷰에만** 줬다.
-- 그 마이그레이션 헤더는 "CONCURRENTLY 재계산에 필요한 UNIQUE 인덱스도 원본과
-- 동일하게 복원한다"고 적고 있다 — 인덱스는 복원됐고 권한은 복원되지 않았다.
-- 원래 권한은 20260725014038_move_market_aggregate_mvs_to_private_schema.sql
-- 22~30행에 있었다. 아래는 그 줄들을 글자 그대로 되돌린 것이다.
--
-- 깨져 있던 기간: 20260725042708 적용 시점 ~ 이 마이그레이션. 약 하루.
--
-- ── 왜 롤 조합이 MV 마다 다른가 (원본 의도 그대로 유지) ────────────────────
-- tx_band_* 는 anon 에도 준다. lib/newui/supabase-read.ts 의 getReadOnlySupabase()
-- 가 service_role 키가 없으면 anon 으로 떨어지도록 되어 있고, /tx 계열은 그
-- 폴백으로라도 읽히는 편이 낫다고 판단한 경로다(집계값만 담긴 MV 라 행 단위
-- 비공개 정보가 없다).
-- map_price_point_mv 는 service_role 에만 준다 — 지도 클러스터는 서버 라우트
-- (/api/map/clusters)에서만 읽고 브라우저가 직접 때리지 않는다.
-- 여기서 범위를 넓히지 않는다. 이 마이그레이션의 목적은 복구지 정책 변경이 아니다.
--
-- ── 사실 우선 ──────────────────────────────────────────────────────────────
-- GRANT 는 데이터를 만들지 않는다. 이미 MV 안에 계산돼 있던 집계를 다시 읽을 수
-- 있게 할 뿐이다. 권한이 없던 동안 화면이 보여 준 "데이터 없음"은 사실이 아니라
-- 삼켜진 오류였고(42501), 그것이 이 사고의 본질이다. 같은 모양을 다시 만들지
-- 않도록 읽는 쪽 코드의 `.catch(() => [])` 도 함께 걷어낸다(별도 커밋).

-- 스키마 USAGE 는 지금도 살아 있지만(실측 anon/authenticated/service_role 모두 true)
-- 이 파일 하나만 봐도 상태가 완결되도록 20260725014038:22 를 그대로 다시 적는다.
-- GRANT 는 멱등이라 다시 줘도 부작용이 없다.
grant usage on schema market_agg to anon, authenticated, service_role;

-- 20260725014038:25
grant select on market_agg.tx_band_landing_mv to anon, authenticated, service_role;
-- 20260725014038:26
grant select on market_agg.tx_band_complex_mv to anon, authenticated, service_role;
-- 20260725014038:30
grant select on market_agg.map_price_point_mv to service_role;

-- complex_sitemap_mv 는 이미 service_role 을 들고 있다(20260726034500:74).
-- 상태 완결성을 위해 한 번 더 적는다 — 멱등.
grant select on market_agg.complex_sitemap_mv to service_role;

-- ── 재발 방지: 스키마 기본 권한 ────────────────────────────────────────────
-- 앞으로 market_agg 에 새로 만들어지는 MV/테이블은 service_role 이 자동으로
-- 읽을 수 있게 한다. drop+create 로 다시 만들 때도 이 기본값이 적용되므로,
-- 최소한 서버 경로가 통째로 죽는 일은 다시 일어나지 않는다.
-- (anon/authenticated 는 기본값에 넣지 않는다 — 새 집계가 공개여야 하는지는
--  매번 판단할 문제지 기본값으로 정할 문제가 아니다.)
--
-- default privileges 는 "그 롤이 앞으로 만드는 객체"에만 적용되므로, 실제로
-- 마이그레이션을 실행하는 롤(postgres)을 FOR ROLE 로 지정해야 효과가 있다.
alter default privileges for role postgres in schema market_agg
  grant select on tables to service_role;

comment on schema market_agg is
  '집계 MV 전용 비공개 스키마. public.*_source 뷰(security_invoker=on)로만 읽는다. '
  'MV 를 drop+create 하면 GRANT 가 같이 날아간다 — 재생성 시 반드시 GRANT 를 다시 적을 것 '
  '(2026-07-25 이 누락으로 /tx·/sitemap-tx.xml 이 하루 동안 죽었다).';
