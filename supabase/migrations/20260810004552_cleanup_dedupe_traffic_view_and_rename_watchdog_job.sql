-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260810004552,
-- name = cleanup_dedupe_traffic_view_and_rename_watchdog_job.
-- 아래 본문은 그 원장의 statements 원문 그대로다(md5 6eac4b6567e6b7e6b4fbc8b075c33725 · 461b —
-- 원장 md5 와 바이트 단위 대조 완료). 내가 새로 쓴 문장은 이 머리말뿐이고
-- SQL 은 한 글자도 손대지 않았다. 이 파일이 적용 시점에 쓰였다는 뜻이 아니다.
--
-- 왜 비어 있었나: 2026-08-10 병렬 세션(소유자 승인 ops 작업)이 MCP 로 적용하고
-- 파일 미러링을 남기지 않았다. 같은 날 6건(20260810001136~20260810004552)을
-- 2026-08-11 에 한꺼번에 복원했다.
--
-- 되돌리기: cron.unschedule('etl-freshness-watchdog-hourly') 후 'etl-freshness-watchdog-daily' 재등록 + 앞 미러의 traffic_composition 뷰 재생성.

-- 2026-08-10 정리
-- 1) reporting.traffic_composition 은 같은 날 먼저 올라온 ops.traffic_bot_share(days)
--    와 목적이 겹친다. 뒤에 만든 쪽(이 세션)을 걷어낸다.
-- 2) 'etl-freshness-watchdog-daily' 를 매시로 바꿔 두었으므로 이름이 실제와 어긋난다.
--    같은 command·같은 스케줄로 이름만 바로잡는다.

drop view if exists reporting.traffic_composition;

select cron.unschedule('etl-freshness-watchdog-daily');

select cron.schedule(
  'etl-freshness-watchdog-hourly',
  '30 * * * *',
  $$SELECT ops.record_health_alerts();$$
);