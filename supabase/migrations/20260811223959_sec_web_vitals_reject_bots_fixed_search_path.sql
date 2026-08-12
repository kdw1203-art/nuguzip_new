-- advisor WARN: function_search_path_mutable (public.web_vitals_reject_bots)
-- 트리거 함수 본문은 NEW 필드 참조와 pg_catalog 연산자(~*)만 사용 → 빈 search_path 로 고정해도 안전.
alter function public.web_vitals_reject_bots() set search_path to '';