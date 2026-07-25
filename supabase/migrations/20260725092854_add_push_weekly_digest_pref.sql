-- 주간 다이제스트 푸시 수신 여부.
-- /digest 화면은 "알림 설정에서 주간 다이제스트 알림을 켜면 매주 요약을 보내드려요"라고
-- 안내하고 있었는데, 정작 그 설정 항목도 발송 크론도 없어서 지킬 수 없는 약속이었다.
-- 발송 경로(app/api/cron/weekly-digest)를 만들면서 그 옵트인 스위치를 여기 추가한다.
-- 기본값 false — 주기 발송은 명시적으로 켠 사람에게만 나간다(안내 문구도 "켜면"이다).
alter table public.notification_preferences
  add column if not exists push_weekly_digest boolean not null default false;

comment on column public.notification_preferences.push_weekly_digest is
  '주간 다이제스트 푸시·수신함 옵트인 (기본 false, 매주 월 18:00 KST 발송)';
