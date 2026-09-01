-- [944] AI 임장노트 초안·예습 브리핑 사용량 — 정리 리포트(report_count)와 별도 열.
-- 무료 월 10회 / 플러스 월 100회 (FEATURE_RULES.ai_note_draft 가 단일 출처).
alter table public.inspection_ai_usage
  add column if not exists draft_count integer not null default 0;
