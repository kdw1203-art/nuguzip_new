-- 2026-08-13: 인스타 릴스·유튜브 쇼츠 자동 업로드 큐.
--
-- 구조: 관리자 API 가 이 표에 행을 넣고, 15분마다 pg_cron 이 앱의 드레인 라우트
-- (/api/cron/social-upload-drain)를 호출해 예약 시각이 지난 행을 1건씩 집행한다.
-- 실제 발행(Meta Graph API·YouTube Data API)은 앱 코드가 한다 — DB 는 큐·상태
-- 원장만 맡는다. 대상별 상태를 분리한 이유: IG 는 성공했는데 YT 가 실패하는
-- 반쪽 성공이 실제로 흔하고, 그걸 한 컬럼으로 뭉개면 재시도가 성공분을 중복
-- 발행한다.
--
-- RLS: 정책 없이 켬 = anon·authenticated 전면 차단(서비스롤 전용). 토큰·오류
-- 문자열이 담기는 운영 표라 공개 API 로 노출할 이유가 없다.
--
-- 롤백: select cron.unschedule('social-upload-drain');
--       drop function ops.run_social_upload_drain();
--       drop table public.social_uploads;
--       delete from storage.buckets where id = 'social-videos';
create table if not exists public.social_uploads (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   text,
  video_url    text not null,
  title        text not null,
  caption      text not null default '',
  hashtags     text[] not null default '{}',
  scheduled_at timestamptz not null default now(),
  -- off = 이 대상에는 올리지 않음 · queued → uploading → published | failed
  ig_status    text not null default 'queued'
               check (ig_status in ('off','queued','uploading','published','failed')),
  yt_status    text not null default 'queued'
               check (yt_status in ('off','queued','uploading','published','failed')),
  ig_media_id  text,
  yt_video_id  text,
  ig_error     text,
  yt_error     text,
  attempts     int not null default 0
);
create index if not exists social_uploads_due_idx
  on public.social_uploads (scheduled_at)
  where ig_status = 'queued' or yt_status = 'queued';
alter table public.social_uploads enable row level security;

comment on table public.social_uploads is
  '릴스·쇼츠 자동 업로드 큐. 관리자 API 가 넣고 드레인 크론이 집행. 정책 없는 RLS = 서비스롤 전용.';

-- 영상 원본 버킷 — IG 발행 API 는 공개 접근 가능한 video_url 을 요구한다.
insert into storage.buckets (id, name, public)
values ('social-videos', 'social-videos', true)
on conflict (id) do nothing;

-- 드레인 트리거 — vault 에 'cron_secret' 이 없으면 조용히 건너뛰지 않고
-- 스킵 사유를 남길 곳이 없으므로, 시크릿 등록 전에는 아무것도 하지 않는다
-- (후속 절차 문서에 등록 방법 명시. 크론 자체는 등록해 둔다).
create or replace function ops.run_social_upload_drain()
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
    return; -- 시크릿 미등록 — 호출해 봐야 403 이다. 등록 절차는 docs/social-shorts-setup.md
  end if;
  perform net.http_post(
    url := 'https://nuguzip.com/api/cron/social-upload-drain',
    headers := jsonb_build_object('x-cron-secret', s, 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function ops.run_social_upload_drain() from public, anon, authenticated;

select cron.schedule('social-upload-drain', '*/15 * * * *', $$select ops.run_social_upload_drain()$$);