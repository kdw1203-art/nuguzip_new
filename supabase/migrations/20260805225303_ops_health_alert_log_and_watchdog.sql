-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260805225303,
-- name = ops_health_alert_log_and_watchdog.
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
-- 이 파일만 읽고 판단하면 안 되는 것 둘:
--   1) 아래 record_health_alerts() 는 `severity <> 'ok'` 를 적재한다. 2분 뒤
--      20260805225415 가 'unknown' 등급을 도입하면서 조건을 `in ('warn','critical')`
--      로 바꿨다. 최종 상태는 그쪽이다.
--   2) ops.health_alert_log 에 RLS 도, 명시적 REVOKE 도 없다. 그래도 익명이 읽지
--      못하는 이유는 스키마 쪽에서 이미 막혀 있기 때문이다 — 2026-08-06 실측:
--        ops 스키마 ACL = postgres=UC/postgres | service_role=U/postgres
--          (anon·authenticated 에 USAGE 없음)
--        ops.health_alert_log relrowsecurity = false, relacl = NULL(소유자 전용)
--      즉 "RLS 가 지키고 있다"가 아니라 "닿을 수가 없다"가 사실이다. ops 스키마를
--      나중에 노출하게 되면 이 테이블은 그 순간 무방비가 된다.
--
-- 되돌리기:
--   drop function ops.record_health_alerts();
--   drop table ops.health_alert_log;

-- ops.etl_freshness() 를 매일 자동 평가해 위반 이력을 남긴다.
-- 사람이 아침에 안 볼 수도 있으므로 이력이 남아야 "며칠째 정체인지"를 사후에 알 수 있다.

create table if not exists ops.health_alert_log (
  id          bigint generated always as identity primary key,
  checked_at  timestamptz not null default now(),
  check_name  text not null,
  severity    text not null,
  detail      text,
  age_hours   numeric
);
create index if not exists health_alert_log_checked_at_idx on ops.health_alert_log (checked_at desc);

create or replace function ops.record_health_alerts()
returns integer
language plpgsql
security definer
set search_path to 'public','ops','cron'
as $$
declare n integer;
begin
  insert into ops.health_alert_log (check_name, severity, detail, age_hours)
  select f.check_name, f.severity, f.detail,
         round((extract(epoch from f.age)/3600.0)::numeric, 1)
  from ops.etl_freshness() f
  where f.severity <> 'ok';
  get diagnostics n = row_count;
  -- 90일 보존
  delete from ops.health_alert_log where checked_at < now() - interval '90 days';
  return n;
end;
$$;

revoke all on function ops.record_health_alerts() from public, anon, authenticated;
comment on function ops.record_health_alerts() is 'ops.etl_freshness() 위반 항목을 ops.health_alert_log 에 적재 (일 1회 cron).';
