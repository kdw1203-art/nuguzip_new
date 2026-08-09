-- 2026-08-01 감사 후속 — 텔레메트리·자동화 표의 anon 쓰기 권한 회수 + 표 정의 미러.
--
-- [2026-08-09 정정] 이 파일은 원장과 다른 것을 주장하고 있었다. 두 가지를 고친다.
--
-- (1) 예전 머리말은 automation_secrets · automation_scripts ·
--     get_automation_script · ingest_daily_news 가 "프로덕션에 직접 만들어져
--     supabase/migrations/ 어디에도 없었다"고 적었다. **파일이 없었을 뿐,
--     원장에는 있었다** — 20260727080008(테이블+ingest_daily_news),
--     20260727080142(get_automation_script)가 만들었고, 지금은 그 두 미러
--     파일이 복원돼 있다. "저장소에 없다"와 "원장에 없다"는 다른 말이다.
--
-- (2) 예전 파일은 원장에 없는 48개 문장(함수 재정의 2개 +
--     `grant execute … to anon, authenticated, service_role` 2줄)을 실행부에
--     들고 있었다. 이 원장 행이 실제로 실행한 것은 아래 10개 문장뿐이다
--     (원장 md5 dad867e2ce443dc0881acf8a8aeb70cc, 1215 bytes — 대조 완료).
--     그 GRANT 2줄이 위험했다: 20260803221147 이 회수하고 20260806182312 가
--     재회수한 anon EXECUTE 를, 이 파일을 재생하는 순간 다시 열게 된다.
--     미러 파일이 원장보다 많이 주장하면, 재생이 곧 보안 회수 해제다.
--     함수 정의는 20260727080008 / 20260727080142 / 20260727081748 미러에 있다.
--
-- 원장 본문 첫 줄의 "(repo: …20260801150000…)" 주석은 적용 당시 세션이 남긴
-- 것을 그대로 보존한 것이다 — 그 파일명은 지금 존재하지 않는다.
--
-- 되돌리기(표 권한만): grant insert, update, delete on public.web_vitals to anon;
--   등 — 하지 말 것. 네 표 모두 service_role 로만 쓴다(코드 전수 확인, 원 머리말).

-- (repo: supabase/migrations/20260801150000_export_automation_drift_and_revoke_anon_writes.sql)
create table if not exists public.automation_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.automation_secrets enable row level security;
revoke all on public.automation_secrets from public, anon, authenticated;

create table if not exists public.automation_scripts (
  key text primary key,
  language text not null default 'python',
  body text not null,
  version integer not null default 1,
  note text,
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.automation_scripts enable row level security;
revoke all on public.automation_scripts from public, anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.web_vitals from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.push_subscriptions from anon, authenticated;
revoke all
  on public.geo_backlog_tmp from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.news_articles from anon, authenticated;
