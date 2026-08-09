-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
-- 원장 version = 20260727080142, name = create_get_automation_script.
-- 아래 SQL 은 원장 statements 원문 그대로다(md5 052ac86112b8a219db2cfacbfdd8ca82,
-- 680 bytes — 복원 시 대조 완료). 내가 쓴 것은 이 머리말뿐이다.
--
-- 읽는 사람 주의: 끝의 anon/authenticated GRANT 는 20260803221147 이 회수했고
-- 20260804234917 이 복붙으로 되돌렸다가 20260806182312 가 다시 회수했다.
-- **최종 상태는 service_role 전용**이다.
-- 되돌리기: drop function public.get_automation_script(text, text);

create or replace function public.get_automation_script(p_secret text, p_key text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_secret text;
  v_body text;
begin
  select value into v_secret from public.automation_secrets where key = 'news_ingest';
  if v_secret is null or p_secret is distinct from v_secret then
    raise exception 'unauthorized';
  end if;
  select body into v_body from public.automation_scripts where key = p_key;
  return v_body;
end;
$fn$;

revoke all on function public.get_automation_script(text, text) from public;
grant execute on function public.get_automation_script(text, text) to anon, authenticated;
