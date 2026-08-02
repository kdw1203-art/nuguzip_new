-- outbox 드레인 크론(항목 40)용 재시도 컬럼 — 가산적.
-- (프로덕션에는 2026-08-01 MCP 마이그레이션으로 적용됨 — 이 파일은 저장소 기록.)
alter table public.notification_outbox
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text;
