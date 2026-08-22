-- 개선 #42 (2026-08-22) — 자동화 RPC 재잠금 v2. (MCP apply_migration 으로 적용됨 — 미러)
-- 8/03·8/06 revoke 가 자꾸 되살아난 원인은 DB 가 아니라 **뉴스 수집 트리거
-- 프롬프트의 "0-1단계 권한 복구(grant)"** 였다 — 매일 아침 수집 세션이
-- 조건 없이 grant 를 재실행했다. 이번에는 프롬프트를 함께 고쳐(grant 단계
-- 제거 + MCP execute_sql 경로로 전환) 원인을 끊었다.
--
-- 단계적 잠금: set(쓰기·스크립트 주입 = 최고 위험)은 즉시 전면 회수.
-- get/ingest 는 authenticated 만 즉시 회수하고, anon 은 수집기가 MCP 경로로
-- 2일 연속 성공을 확인한 뒤 수집기 스스로 마저 회수한다(프롬프트에 지시).
revoke execute on function public.set_automation_script(text,text,text) from public, anon, authenticated;
revoke execute on function public.get_automation_script(text,text) from public, authenticated;
revoke execute on function public.ingest_daily_news(text,jsonb) from public, authenticated;
-- 뉴스 원천 표 직접 SELECT 도 회수(검증은 08-11 부터 MCP 로만 해 왔다 — 실측)
revoke select on public.news_articles from anon, authenticated;
