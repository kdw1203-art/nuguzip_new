-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260805024423,
-- name = harden_public_rpcs_tier1_fix_public_grant.
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
-- 이 파일이 scripts/check-migration-grants.mjs 규칙 B 가 잡으라고 만들어진 바로 그
-- 사고의 실물이다 — 앞 마이그레이션의 `FROM anon, authenticated` 는 문법상 성공하고
-- 의미상 아무 일도 하지 않았다. 린트는 앞 파일을 이 파일 덕분에 통과시킨다
-- (규칙 B 는 "나중 파일이 바로잡았으면 됐다"로 본다).

-- 보정: set_automation_script 의 ACL 은 {=X/postgres, ...} 즉 PUBLIC 에 EXECUTE 가
-- 부여된 형태였다. anon/authenticated 에서만 REVOKE 해서는 막히지 않는다.
-- PUBLIC 에서 회수해야 실제로 차단된다. service_role/postgres 는 명시적 GRANT 를
-- 별도로 보유하므로 서버 경로는 영향이 없다.

REVOKE EXECUTE ON FUNCTION public.set_automation_script(text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_automation_script(text, text, text) TO service_role;
