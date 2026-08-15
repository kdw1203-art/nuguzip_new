-- 크리에이터 리포트 판매 루프 (2026-08-15)
--
-- reports.source_note_id — 유료 리포트의 **전달물**을 임장노트로 연결한다.
-- 지금까지 reports 에는 본문 컬럼이 없어 구매해도 받을 것이 없었고, 그래서
-- 자료실은 일부러 상세·구매 링크를 걸지 않았다("전달물 없는 판매 금지").
-- 이 컬럼이 그 전달물이다: 구매 기록(report_purchases)이 있으면 연결된
-- 비공개 노트를 열람할 수 있다(접근 판정은 앱 계층 — 노트 상세의 게이트).
alter table public.reports
  add column if not exists source_note_id uuid;