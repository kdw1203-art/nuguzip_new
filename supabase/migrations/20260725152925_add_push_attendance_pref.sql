-- 출석 리마인드 푸시 수신 여부.
-- attendance-reminders 크론은 push_subscriptions 전체(오늘 미출석자)에게 발송하고
-- 있었는데, /my/settings 어디에도 이걸 끌 스위치가 없었다 — 구독 해지 말고는
-- 벗어날 방법이 없는 알림은 알림이 아니라 소음이다.
-- 기본값 true — 지금까지 받던 사람의 동작을 바꾸지 않고, 끈 사람만 크론이 제외한다
-- (push_reengagement · push_listing_stale 과 같은 "본인 루틴 안내 = 기본 켜짐" 규칙).
alter table public.notification_preferences
  add column if not exists push_attendance boolean not null default true;

comment on column public.notification_preferences.push_attendance is
  '출석 리마인드 푸시 수신 (기본 true, 매일 18:00 KST 미출석자에게 1회)';
