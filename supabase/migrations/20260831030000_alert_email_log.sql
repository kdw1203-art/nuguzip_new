-- [G002] 심각 경보 이메일 발송 기록.
--
-- 경보는 ops.health_alert_log 에 쌓이고 관리자 화면(G001 배너·/admin/ops)에
-- 보이지만, 둘 다 "들어와야 보인다". critical 은 밖으로 나가야 한다.
-- 이 표는 그 발송의 쿨다운 상태다 — 같은 장애로 매시간 메일을 쏘지 않도록
-- 마지막 발송 시각을 기억한다(23시간 쿨다운, /api/cron/alert-email).
create table if not exists ops.alert_email_log (
  id bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  alert_count int not null,
  summary text not null
);

comment on table ops.alert_email_log is
  '심각(critical) 경보 요약 메일 발송 이력 — /api/cron/alert-email 의 쿨다운 근거';

-- 서비스 롤 전용(다른 ops 표와 동일한 취급). RLS 는 서비스 롤에 적용되지 않지만
-- 켜 두어 anon/authenticated 의 우회 접근을 명시적으로 막는다.
alter table ops.alert_email_log enable row level security;
