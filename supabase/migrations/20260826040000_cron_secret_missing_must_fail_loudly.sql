-- 시크릿이 없으면 조용히 끝내지 말고 실패하게 한다. (서버 반영 완료 · 이 파일은 기록)
--
-- 실측(2026-08-26): vault 에 'cron_secret' 미등록('toss_secret_key' 하나뿐).
-- ops.run_billing_renewals() 는 `if s is null then return;` 에서 즉시 끝났고,
-- cron.job_run_details 에는 25회 실행 · 25회 succeeded 로 남았다(마지막 08-26 10:10 KST).
-- 8월 13일 배선 이후 갱신은 한 번도 돌지 않았는데 기록은 계속 성공이었다.
--
-- ops.cron_job_failure_check 는 status <> 'succeeded' 만 보므로 이 잡을 못 잡는다.
-- 아무 일도 안 하면서 성공을 보고하는 잡은, 실패하는 잡보다 나쁘다.
-- raise 로 바꾸면 기존 경보 배선(매시 → critical → /admin/ops)이 그대로 잡는다.
--
-- 소유자 조치: Supabase vault 에 'cron_secret' = Vercel 의 CRON_SECRET 과 같은 값.

create or replace function ops.run_billing_renewals()
returns void language plpgsql security definer
set search_path to 'ops','net','vault','pg_catalog'
as $function$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if s is null then
    raise exception
      'vault 시크릿 cron_secret 미등록 — 자동결제 갱신을 호출할 수 없습니다. '
      'Vercel 의 CRON_SECRET 과 같은 값을 Supabase vault 에 cron_secret 이름으로 등록하세요.';
  end if;
  perform net.http_post(
    url := 'https://nuguzip.com/api/cron/billing-renewals',
    headers := jsonb_build_object('x-cron-secret', s, 'content-type', 'application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 240000);
end;
$function$;

create or replace function ops.run_social_autopost()
returns void language plpgsql security definer
set search_path to 'ops','net','vault','pg_catalog'
as $function$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if s is null then
    raise exception 'vault 시크릿 cron_secret 미등록 — social-autopost 를 호출할 수 없습니다.';
  end if;
  perform net.http_post(
    url := 'https://nuguzip.com/api/cron/social-autopost',
    headers := jsonb_build_object('x-cron-secret', s, 'content-type', 'application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 240000);
end;
$function$;

create or replace function ops.run_social_upload_drain()
returns void language plpgsql security definer
set search_path to 'ops','net','vault','pg_catalog'
as $function$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if s is null then
    raise exception 'vault 시크릿 cron_secret 미등록 — social-upload-drain 을 호출할 수 없습니다.';
  end if;
  perform net.http_post(
    url := 'https://nuguzip.com/api/cron/social-upload-drain',
    headers := jsonb_build_object('x-cron-secret', s, 'content-type', 'application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 240000);
end;
$function$;

revoke all on function ops.run_billing_renewals() from public, anon, authenticated;
revoke all on function ops.run_social_autopost() from public, anon, authenticated;
revoke all on function ops.run_social_upload_drain() from public, anon, authenticated;
