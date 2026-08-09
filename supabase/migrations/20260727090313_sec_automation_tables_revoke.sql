-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
-- 원장 version = 20260727090313, name = sec_automation_tables_revoke.
-- 아래 SQL 은 원장 statements 원문 그대로다(md5 1d8a1fc6baee62a53f1e95ad56fa0e73,
-- 372 bytes — 복원 시 대조 완료). 내가 쓴 것은 이 머리말뿐이다.
-- 되돌리기: grant select on public.automation_secrets to anon;  -- 하지 말 것(비밀 표)

-- 자동화 공유 시크릿 테이블 — RLS 한 겹에만 의지하지 않는다.
-- get_automation_script / ingest_daily_news 가 이 값과 대조하는 구조라,
-- 이 테이블이 한 번 읽히면 두 RPC 가 그대로 열린다.
revoke all on public.automation_secrets from anon, authenticated;
revoke all on public.automation_scripts from anon, authenticated;