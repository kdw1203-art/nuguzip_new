-- [945 · 실사용50 #20] 관심단지 새 실거래 알림.
-- user_watchlist.last_tx_seen_at: 마지막으로 확인한 신규 신고 시각(고수위선).
--   null(최초)에는 알림 없이 기준만 세운다 — 과거 전체를 "새 소식"으로 쏟지 않는다.
alter table public.user_watchlist add column if not exists last_tx_seen_at timestamptz;
comment on column public.user_watchlist.last_tx_seen_at is '관심단지 새 실거래 알림의 고수위선 — 이 시각 이후 적재된 신고만 새 소식';

-- notification_preferences.email_watchlist_tx: 새 실거래 메일 채널(기본 켜짐, 끄면 메일만 생략)
alter table public.notification_preferences add column if not exists email_watchlist_tx boolean;
comment on column public.notification_preferences.email_watchlist_tx is '관심단지 새 실거래 메일 수신 (null=기본 true)';
