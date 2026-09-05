-- [965] 이메일 → Supabase Auth 사용자 조회를 O(1)/O(log n) 으로.
--
-- 왜: 회원가입 재발송·비밀번호 재설정이 Auth 사용자를 찾을 때
-- `auth.admin.listUsers` 를 200명씩 5페이지(=1,000명) 훑는 선형 탐색을 썼다.
-- 1,001번째 사용자부터는 "없는 사용자" 로 판정돼 재발송·재설정이 조용히 실패한다.
--
-- 1) app_users.supabase_user_id — 가입(ensureAppUserRow) 때 기록. 코드는 이 컬럼이
--    있으면 넣도록 이미 되어 있었지만 컬럼이 운영 DB 에 없었다(최소 컬럼 재시도로
--    조용히 빠졌다). 기존 행은 auth.users 와 이메일로 맞춰 백필한다.
-- 2) public.auth_user_id_by_email(p_email) — auth.users 를 읽는 security definer.
--    service_role 전용: anon·authenticated·public 의 EXECUTE 는 회수한다(REVOKE 만,
--    GRANT 없음 — 기본 권한으로 붙는 anon 실행권을 떼는 것이다).
--
-- 가산만·재실행 안전.

alter table public.app_users
  add column if not exists supabase_user_id uuid;

create index if not exists app_users_supabase_user_id_idx
  on public.app_users (supabase_user_id)
  where supabase_user_id is not null;

update public.app_users a
   set supabase_user_id = u.id
  from auth.users u
 where a.supabase_user_id is null
   and lower(u.email) = lower(a.email);

create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select u.id
    from auth.users u
   where lower(u.email) = lower(p_email)
   order by u.created_at asc
   limit 1
$$;

comment on function public.auth_user_id_by_email(text) is
  '[965] 이메일 → auth.users.id. service_role 전용(anon·authenticated 실행권 회수). 회원가입 재발송·비밀번호 재설정이 쓴다.';

revoke all on function public.auth_user_id_by_email(text) from public;
revoke all on function public.auth_user_id_by_email(text) from anon;
revoke all on function public.auth_user_id_by_email(text) from authenticated;
