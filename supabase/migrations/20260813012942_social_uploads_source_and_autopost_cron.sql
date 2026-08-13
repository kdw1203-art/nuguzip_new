-- 2026-08-13: 소셜 자동 소재(임장노트·홍보) 추적 컬럼 + 자동 생성 크론.
--
-- source_kind/source_ref: 어떤 소재로 만든 영상인지('note', 노트 id 등).
-- 부분 유니크 인덱스가 같은 소재의 중복 발행을 DB 레벨에서 막는다 —
-- 코드가 실수해도(재실행·경합) 두 번 올라가지 않는다.
--
-- 크론: 매일 02:00 UTC(11:00 KST) 자동 생성 라우트 호출. 드레인과 동일한
-- vault('cron_secret') 패턴 — 시크릿 미등록이면 아무것도 하지 않는다.
--
-- 롤백: select cron.unschedule('social-autopost');
--       drop function ops.run_social_autopost();
--       drop index if exists social_uploads_source_uniq;
--       alter table public.social_uploads drop column source_kind, drop column source_ref;
alter table public.social_uploads
  add column if not exists source_kind text not null default 'manual',
  add column if not exists source_ref  text;

create unique index if not exists social_uploads_source_uniq
  on public.social_uploads (source_kind, source_ref)
  where source_ref is not null;

create or replace function ops.run_social_autopost()
returns void
language plpgsql
security definer
set search_path to 'ops','net','vault','pg_catalog'
as $$
declare
  s text;
begin
  select decrypted_secret into s
    from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if s is null then
    return; -- 시크릿 미등록 — docs/social-shorts-setup.md C 절차 필요
  end if;
  perform net.http_post(
    url := 'https://nuguzip.com/api/cron/social-autopost',
    headers := jsonb_build_object('x-cron-secret', s, 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function ops.run_social_autopost() from public, anon, authenticated;

select cron.schedule('social-autopost', '0 2 * * *', $$select ops.run_social_autopost()$$);