-- complexes_needing_geocode — PUBLIC 기본 EXECUTE 회수 (실효 없던 revoke 바로잡기)
--
-- 20260726170000 은 이렇게 썼다:
--   revoke all on function public.complexes_needing_geocode(integer) from anon, authenticated;
--
-- 이 문장은 아무것도 회수하지 않았다. PostgreSQL 은 함수를 만들 때 기본으로
-- GRANT EXECUTE ... TO PUBLIC 을 주고, anon 과 authenticated 는 그 권한을 개별로
-- 받은 적이 없으며 **PUBLIC 의 구성원으로서** 갖는다. 없는 권한을 회수하는 문장은
-- 에러도 경고도 없이 조용히 성공한다 — 그래서 "회수했다"고 적힌 채 열려 있었다.
-- (이 함수는 security definer 라 소유자 권한으로 65만 행 테이블을 훑는다.
--  anon 이 p_limit=1000 으로 반복 호출하면 그대로 DB 를 밀 수 있다.)
--
-- 2026-07-27 감사에서 같은 실수를 마이그레이션 전수에서 찾았고, 다시 나지 않도록
-- scripts/check-migration-grants.mjs 에 CI 검사를 넣었다.

revoke all on function public.complexes_needing_geocode(integer) from public;
revoke all on function public.complexes_needing_geocode(integer) from anon;
revoke all on function public.complexes_needing_geocode(integer) from authenticated;
grant execute on function public.complexes_needing_geocode(integer) to service_role;
