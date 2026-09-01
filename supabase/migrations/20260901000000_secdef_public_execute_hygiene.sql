-- [939 · I002] SECURITY DEFINER 전수 점검 후속 — PUBLIC EXECUTE 위생 회수.
-- 점검 결과(2026-09-01): public 45종·ops 29종·private 1종 전부 search_path 고정 확인(수리 0건).
-- 아래 6종 읽기 RPC는 anon·authenticated 에 명시 GRANT 가 이미 있으므로,
-- 잉여 PUBLIC(미래의 모든 롤 포함) EXECUTE 만 걷는다 — 기능 변화 0
-- (회수 직후 anon 롤로 market_region_names() 실행 검증: 218행 정상).
-- 원칙: 권한은 걷기만 하고 새로 주지 않는다. get/set_automation_script 의
-- anon EXECUTE 는 설계 유지 항목이라 손대지 않는다. 전체 점검 기록은
-- docs/security/security-definer-audit.md.
revoke execute on function public.map_complex_attrs(double precision,double precision,double precision,double precision,integer) from public;
revoke execute on function public.map_filter_facets(double precision,double precision,double precision,double precision,integer) from public;
revoke execute on function public.market_region_names() from public;
revoke execute on function public.popular_complexes(double precision,double precision,double precision,double precision,integer,bigint,bigint,numeric,numeric,integer,integer,integer,integer) from public;
revoke execute on function public.search_complexes_preview(text,integer) from public;
revoke execute on function public.search_regions(text,integer) from public;
