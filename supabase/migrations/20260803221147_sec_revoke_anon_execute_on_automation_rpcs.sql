-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
-- 원장 version = 20260803221147, name = sec_revoke_anon_execute_on_automation_rpcs.
-- 아래 SQL 은 원장 statements 원문 그대로다(md5 8baa4fefc92d7e6a68c023df7596eb97,
-- 688 bytes — 복원 시 대조 완료). 내가 쓴 것은 이 머리말뿐이다.
--
-- 이 결손이 값비쌌다: 이 회수는 다음 날 20260804234917 의 복붙 GRANT 로
-- 되돌려졌는데, 회수한 이 파일이 저장소에 없어서 "GRANT 는 보이고 REVOKE 는
-- 안 보이는" 상태였다. 나흘 뒤 20260806182312 가 실측으로 발견해 재회수했다.
-- 미러 파일이 없는 보안 회수는 다음 기능 마이그레이션이 조용히 되돌릴 수 있다.
-- 되돌리기: 하지 말 것 — 20260806182312 의 근거 참조.

-- 보안(2026-08-03): 자동화 RPC 2개의 anon·authenticated 실행권한 회수.
--
-- 소유자 확인: 뉴스 수집기는 service_role 키로 호출한다. service_role 은 GRANT 를
-- 우회하므로 매일 08:00 뉴스 적재는 영향이 없다. anon/authenticated 실행권한을
-- 없애 "누구나 secret 을 대입해 볼 수 있던" RPC 공격 표면을 제거한다(secret 은
-- 이제 유일 방어선이 아니라 이중 방어선이 된다). 되돌리려면 GRANT 로 재부여.
revoke execute on function public.get_automation_script(text, text) from anon, authenticated;
revoke execute on function public.ingest_daily_news(text, jsonb)   from anon, authenticated;