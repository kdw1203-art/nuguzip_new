-- [OPT-01] Web Vitals attribution — LCP 범인 규명 계측 (Wave 10)
-- MCP apply_migration 'wave10_web_vitals_attribution' 로 2026-08-24 적용 완료. 이 파일은 기록용 미러.
alter table public.web_vitals
  add column if not exists element text,
  add column if not exists attr_url text;
comment on column public.web_vitals.element is 'LCP 요소 선택자 / INP 대상 / CLS 최대 이동 대상 (web-vitals attribution)';
comment on column public.web_vitals.attr_url is 'LCP 리소스 URL (이미지 등) — 텍스트 LCP 면 null';
