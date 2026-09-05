-- [965] 회원탈퇴 요청 원장.
--
-- 왜: 이용약관 제○조 ②("서비스 내 회원탈퇴 기능")·FAQ 는 앱 안의 탈퇴 기능을
-- 약속하는데, 설정 화면은 "고객센터로" 였다. 앱 안에서 요청을 받되 파기 절차는
-- docs/ops/privacy-requests.md 그대로다 — 접수 즉시 로그인 차단·공개 콘텐츠
-- 비공개, 30일 유예 뒤 파기(법령 보존 대상은 가명화해 보존).
--
-- 이 표는 그 접수·유예·파기 상태를 기록한다. 개인 식별 컬럼은 user_email 뿐이고
-- 파기 때 함께 가명화한다. service_role 전용(RLS on · 정책 없음).
-- 가산만·재실행 안전.

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  requested_at timestamptz not null default now(),
  purge_after timestamptz not null default (now() + interval '30 days'),
  reason text,
  ip_address text,
  user_agent text,
  cancelled_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.account_deletion_requests is
  '[965] 회원탈퇴 요청 — 접수 즉시 app_users.is_banned 로 로그인 차단, purge_after 이후 SOP(docs/ops/privacy-requests.md) 대로 파기. service_role 전용.';

create index if not exists account_deletion_requests_email_idx
  on public.account_deletion_requests (user_email);

/* 열린 요청(취소·파기 전)은 이메일당 하나 */
create unique index if not exists account_deletion_requests_open_uidx
  on public.account_deletion_requests (user_email)
  where cancelled_at is null and purged_at is null;

alter table public.account_deletion_requests enable row level security;

revoke all on table public.account_deletion_requests from anon;
revoke all on table public.account_deletion_requests from authenticated;
