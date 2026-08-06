-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260805024341,
-- name = harden_public_rpcs_tier1.
-- 아래 본문은 그 원장의 statements 원문 그대로다. 내가 새로 쓴 문장은 이 머리말뿐이고
-- SQL 은 한 글자도 손대지 않았다. 이 파일이 적용 시점에 쓰였다는 뜻이 아니다.
--
-- 왜 비어 있었나: 이전 세션이 MCP apply_migration 으로 적용하고 파일 미러링을 빠뜨렸다.
-- 20260804234917 ~ 20260805225415 구간 11건을 2026-08-06 에 한꺼번에 복원했다.
-- 이 11건이 전부라는 뜻은 아니다. 같은 날 원장을 전수로 세어 본 결과는 이렇다 —
-- 기준선(20260724212021) 이후 원장 160행 대 파일 79개, 원장이 만들고 지금도 DB 에
-- 남아 있는 객체 238개 중 78개는 저장소 어디에도 정의가 없다. "11건" 은 눈에 띈
-- 최근 구간이었을 뿐이고, 센 결과가 아니었다.
-- 남은 결손은 supabase/ledger-snapshot.json 의 known_unmirrored 에 근거(원장 version)와
-- 함께 적어 두었고, scripts/check-migration-ledger.mjs 가 릴리스 게이트에서 다시 센다.
--
-- 이 파일만 읽고 판단하면 안 되는 것이 둘 있다.
--   1) 아래 set_automation_script 회수는 **실제로는 아무것도 막지 못했다**. ACL 이
--      PUBLIC 에 걸려 있어서 anon/authenticated 만 회수하면 조용히 성공만 한다.
--      바로 다음 20260805024423 이 PUBLIC 에서 회수해 실효를 냈다.
--   2) 아래 complex_tx_stats_base 회수는 **틀린 판단이었고 되돌려졌다**
--      (20260805095832). 서버 읽기 경로가 service_role 키가 없을 때 anon 키로
--      폴백해서 42501 로 죽는다. 최종 상태는 anon/authenticated SELECT 가 있다.
--
-- 되돌리기: 위 두 후속 마이그레이션이 이미 최종 상태를 정하고 있다. 이 파일만
--           단독으로 되돌릴 일은 없다.

-- 유입 확대 전 공개 API 표면 축소 (TIER 1)
-- 2026-08-05. 근거: Supabase Database Linter + 클라이언트 번들 정적 검사.
--
-- 적용 대상 선정 근거:
--  * set_automation_script  : 예약 작업이 내려받아 실행하는 스크립트의 "쓰기" 경로.
--                             anon 이 시크릿만 맞히면 임의 스크립트 주입 가능.
--                             읽기(get_)는 건드리지 않으므로 수집 파이프라인 무영향.
--  * complex_tx_stats_base  : /rest/v1/ 로 전량 덤프 가능한 머티리얼라이즈드 뷰.
--                             클라이언트 번들(862KB, 21 chunks) 정적 검사 결과
--                             참조 0건 → 모든 접근이 서버(service_role) 경유로 확인됨.
--
-- 의도적으로 제외한 것:
--  * is_admin_request()     : RLS 정책 30건 이상이 이 함수를 호출하며 일부는
--                             role=public(anon 포함). anon 에서 EXECUTE 를 회수하면
--                             정책 평가가 깨진다. 회수하지 않는 것이 정답.
--  * get_automation_script / ingest_daily_news : 뉴스 수집기가 anon 키로 호출할
--                             가능성이 있어 호출부 확인 후 별도 적용(TIER 2).

REVOKE EXECUTE ON FUNCTION public.set_automation_script(text, text, text) FROM anon, authenticated;

REVOKE SELECT ON public.complex_tx_stats_base FROM anon, authenticated;
