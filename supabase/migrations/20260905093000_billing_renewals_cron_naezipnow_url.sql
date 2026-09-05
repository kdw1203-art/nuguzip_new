-- [965] 자동결제 갱신 크론(pg_cron → ops.run_billing_renewals)의 대상 주소를 새 정식
-- 도메인으로. 예전 본문은 https://nuguzip.com/... 을 하드코딩했는데, 도메인 전환
-- (2026-09) 뒤 middleware 가 nuguzip.com 을 naezipnow.com 으로 308 하고 pg_net 은
-- 리다이렉트를 따라가지 않는다 — 크론이 매번 308 을 받고 "성공" 으로 끝났다.
--
-- 참고: 이 함수는 vault 의 cron_secret 이 없으면 큰 소리로 실패하도록 돼 있고
-- (20260826040000), 2026-09-05 기준 그 시크릿은 등록돼 있지 않다. 실제 갱신은
-- vercel.json 의 크론(Authorization: Bearer CRON_SECRET)이 같은 시각에 돌리고 있다.
-- 이 함수는 그 2차 경로다 — 소유자가 vault 에 cron_secret 을 넣는 순간부터 쓸모가 있다.
-- 함수 본문만 바꾼다(권한 변경 없음 — CREATE OR REPLACE 는 기존 권한을 유지한다).

create or replace function ops.run_billing_renewals()
returns void
language plpgsql
security definer
set search_path to 'ops', 'net', 'vault', 'pg_catalog'
as $$
declare
  s text;
begin
  select decrypted_secret into s
    from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if s is null then
    raise exception
      'vault 시크릿 cron_secret 미등록 — 자동결제 갱신을 호출할 수 없습니다. '
      'Vercel 의 CRON_SECRET 과 같은 값을 Supabase vault 에 cron_secret 이름으로 등록하세요.';
  end if;
  perform net.http_post(
    url := 'https://naezipnow.com/api/cron/billing-renewals',
    headers := jsonb_build_object('x-cron-secret', s, 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  );
end;
$$;
