-- =============================================================================
-- 공개 API 표면 축소 — 유입 확대 전 하드닝
-- 2026-08-05
--
-- ✅ TIER 1 은 프로덕션에 이미 적용 완료되었습니다.
--    적용된 마이그레이션 이름:
--      harden_public_rpcs_tier1
--      harden_public_rpcs_tier1_fix_public_grant
--    이 파일은 저장소에 기록을 남기기 위한 사본입니다.
--    (supabase db pull 을 쓰신다면 이미 반영돼 있을 수 있으니 중복 확인하십시오.)
-- =============================================================================
--
-- 배경 (Supabase Database Linter 실측):
--   10개 함수가 anon 역할로 SECURITY DEFINER 실행 가능한 상태였습니다.
--   대부분(search_complexes_preview, map_complex_attrs, popular_complexes 등)은
--   공개 조회용이라 의도된 설계로 보이며 건드리지 않았습니다.
--
--   문제는 "시크릿 문자열 하나"로만 방어되는 관리 함수들입니다.
--   https://<ref>.supabase.co/rest/v1/rpc/<fn> 로 anon 키만 있으면 호출 시도가
--   가능하고, DB 레벨 레이트리밋이 없어 무제한 대입이 가능합니다.
--   특히 set_automation_script 는 예약 작업이 매 실행마다 내려받아 실행하는
--   스크립트를 덮어쓸 수 있었습니다.

-- -----------------------------------------------------------------------------
-- TIER 1 — 적용 완료 (2026-08-05)
-- -----------------------------------------------------------------------------
BEGIN;

-- 1) 자동화 스크립트 "쓰기". 가장 위험한 함수.
--    ⚠️ 이 함수의 ACL 은 {=X/postgres, ...} 즉 PUBLIC 에 EXECUTE 가 부여된
--    형태였습니다. anon/authenticated 에서만 REVOKE 하면 막히지 않습니다.
--    PUBLIC 에서 회수해야 실제로 차단됩니다. (실제로 1차 시도가 이것 때문에
--    무효였고, 2차 마이그레이션으로 보정했습니다.)
REVOKE EXECUTE ON FUNCTION public.set_automation_script(text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_automation_script(text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_automation_script(text, text, text) TO service_role;

-- 2) 머티리얼라이즈드 뷰 직접 노출 차단.
--    /rest/v1/complex_tx_stats_base 로 전량 덤프가 가능했습니다.
--    클라이언트 번들(862KB / 21 chunks) 정적 검사에서 참조 0건 →
--    모든 접근이 서버(service_role) 경유임을 확인하고 적용했습니다.
REVOKE SELECT ON public.complex_tx_stats_base FROM anon, authenticated;

COMMIT;

-- 적용 후 실측 확인 결과:
--   set_automation_script → 42501 permission denied for function  ✅
--   complex_tx_stats_base → 42501 permission denied for mat. view ✅
--   search_complexes_preview → 정상 응답 (회귀 없음)              ✅
--   / · /map · /complex/* · /analysis/temperature · /town → 전부 200 ✅

-- -----------------------------------------------------------------------------
-- 의도적으로 적용하지 않은 것 — is_admin_request()
-- -----------------------------------------------------------------------------
-- 린터는 이 함수도 anon 노출로 잡지만, 회수하면 안 됩니다.
--   select tablename, policyname from pg_policies
--   where schemaname='public' and qual ~ 'is_admin_request';
-- 위 쿼리로 확인한 결과 30건 이상의 RLS 정책이 이 함수를 호출하고 있고,
-- 그중 일부는 role = public (anon 포함) 입니다.
-- RLS 정책 표현식은 조회하는 역할의 권한으로 평가되므로, anon 에서 EXECUTE 를
-- 회수하면 정책 평가 자체가 permission denied 로 깨집니다.
-- → 린터 경고를 남겨두는 것이 올바른 선택입니다.

-- -----------------------------------------------------------------------------
-- TIER 2 — 호출부 확인 후 적용 (뉴스 수집 파이프라인을 끊을 수 있음)
-- -----------------------------------------------------------------------------
-- 매일 08:00 KST 뉴스 수집 작업이 anon 키 + 시크릿으로 아래 함수들을 호출한다면
-- 적용하는 순간 수집이 멈춥니다. 먼저 호출부를 확인하십시오:
--
--   rg -n "get_automation_script|ingest_daily_news" --glob '!node_modules'
--
-- 호출부가 createClient(URL, SERVICE_ROLE_KEY) 를 쓰고 있으면 안전합니다.
-- (service_role 은 GRANT/RLS 를 우회합니다.)
-- 참고: 이 두 함수는 PUBLIC 이 아니라 anon/authenticated 에 명시적으로
-- GRANT 되어 있으므로, 아래 REVOKE 만으로 정상 차단됩니다.
--
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.get_automation_script(text, text) FROM anon, authenticated;
-- REVOKE EXECUTE ON FUNCTION public.ingest_daily_news(text, jsonb)    FROM anon, authenticated;
-- COMMIT;
--
-- 적용 후 확인 (다음날 08:00 이후):
--   select count(*), max(created_at) from news_articles;   -- 증가해야 정상
--   select key, updated_at from automation_scripts;

-- -----------------------------------------------------------------------------
-- 선택 사항 — 별도 배포 권장
-- -----------------------------------------------------------------------------
-- CREATE SCHEMA IF NOT EXISTS extensions;
-- ALTER EXTENSION vector SET SCHEMA extensions;
--   → note_embeddings 등 vector 타입 컬럼이 있으므로 스테이징 검증 후 적용.

-- -----------------------------------------------------------------------------
-- 롤백
-- -----------------------------------------------------------------------------
-- BEGIN;
-- GRANT EXECUTE ON FUNCTION public.set_automation_script(text, text, text) TO anon, authenticated;
-- GRANT SELECT ON public.complex_tx_stats_base TO anon, authenticated;
-- COMMIT;
