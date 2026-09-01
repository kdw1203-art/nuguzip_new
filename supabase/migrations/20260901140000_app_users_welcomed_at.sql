-- [945 · 실사용50 #14] 환영 메일 1회 발송 선점 표식.
-- update … where welcomed_at is null 이 행을 돌려줄 때만 발송한다(원자적 선점).
alter table public.app_users add column if not exists welcomed_at timestamptz;
comment on column public.app_users.welcomed_at is '환영 메일 발송 시각(첫 로그인 시 원자 선점) — null이면 미발송';
