-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260805224608,
-- name = fix_data_quality_snapshot_duration.
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
-- 무엇을 고치는가: 14초 전 적용된 20260805224554 의 duration_ms 계산이
--   `extract(milliseconds ...)::int + 1000 * extract(epoch ...)::int / 1`
-- 였다. milliseconds 성분은 "초 + 밀리초"를 이미 담고 있어서 초 미만이 두 번 세어지고,
-- 뒤 항은 정수 나눗셈이라 초 단위로 잘린다. 즉 기록된 소요시간이 실제보다 길게 나왔다.
-- 아래가 올바른 식이다. 원본 마이그레이션에는 주석이 없었고, 여기 머리말이 그 설명이다.
--
-- 되돌리기: 20260805224554 의 함수 본문을 다시 적용하면 된다(단, 그건 틀린 식이다).

create or replace function public.capture_data_quality_snapshot()
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t0 timestamptz := clock_timestamp();
  p  jsonb;
  newid bigint;
begin
  p := public.data_quality_report_live();
  insert into public.data_quality_snapshot (duration_ms, payload)
  values (round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int, p)
  returning id into newid;
  delete from public.data_quality_snapshot
   where id not in (select id from public.data_quality_snapshot order by computed_at desc limit 30);
  return newid;
end;
$$;
revoke all on function public.capture_data_quality_snapshot() from public, anon, authenticated;
