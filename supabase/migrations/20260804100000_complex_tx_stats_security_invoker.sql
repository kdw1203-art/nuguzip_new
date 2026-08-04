-- 소유자 원격 적용 마이그레이션 미러 (2026-08-04, Supabase MCP 로 적용 완료).
--
-- Security Advisor CRITICAL 해소: public.complex_tx_stats 가 SECURITY DEFINER
-- (소유자 권한) 뷰였다. 이 저장소의 규칙은 invoker 뷰 + 하부 객체 명시적 GRANT 다
-- (definer 뷰는 하부에 무엇이 추가되든 소유자 권한으로 통째로 노출되는 구조라
-- 어드바이저가 CRITICAL 로 잡는다). 내용물은 단지 실거래 공개 집계라
-- anon/authenticated 읽기가 의도된 동작이고, invoker 전환 후에도 같은 결과가
-- 나오도록 하부 MV 두 개에 SELECT 를 명시적으로 부여한다.
-- (grant 없이 invoker 로만 바꾸면 /complex 페이지가 42501 로 죽는다 —
--  2026-07-25 /tx 하루 장애와 같은 패턴이므로 반드시 같은 트랜잭션에서.)
--
-- 적용 후 검증: anon 키 REST 로 complex_tx_stats 조회 200 + households 조인 유지.

ALTER VIEW public.complex_tx_stats SET (security_invoker = on);

GRANT USAGE ON SCHEMA market_agg TO anon, authenticated;
GRANT SELECT ON public.complex_tx_stats_base TO anon, authenticated;
GRANT SELECT ON market_agg.complex_households_resolved TO anon, authenticated;
