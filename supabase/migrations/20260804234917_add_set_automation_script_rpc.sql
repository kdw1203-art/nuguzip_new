-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260804234917,
-- name = add_set_automation_script_rpc.
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
-- 읽는 사람 주의: 이 파일 끝의 anon/authenticated GRANT 는 **바로 다음 두 마이그레이션에서
-- 회수된다**(20260805024341, 20260805024423). 여기까지만 읽고 "익명이 스크립트를 쓸 수
-- 있다"고 결론내면 틀린다. 최종 상태는 service_role 전용이다.
--
-- 되돌리기: drop function public.set_automation_script(text, text, text);

create or replace function public.set_automation_script(p_secret text, p_key text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
begin
  select value into v_secret from public.automation_secrets where key = 'news_ingest';
  if v_secret is null or p_secret is distinct from v_secret then
    raise exception 'unauthorized';
  end if;
  if p_body is null or length(p_body) < 500 then
    raise exception 'body too short';
  end if;

  insert into public.automation_scripts (key, body)
  values (p_key, p_body)
  on conflict (key) do update set body = excluded.body;

  return jsonb_build_object('ok', true, 'key', p_key,
                            'length', length(p_body), 'md5', md5(p_body));
end;
$function$;

grant execute on function public.set_automation_script(text, text, text) to anon, authenticated;
grant execute on function public.get_automation_script(text, text) to anon, authenticated;
grant execute on function public.ingest_daily_news(text, jsonb) to anon, authenticated;
