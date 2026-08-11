-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260811065248, name = tmp_bench_search_preview_v0.
-- 아래 본문은 그 원장의 statements 원문 그대로다(md5 c693f4d88c22dcb6ba129986b439aa71 · 1747b —
-- 원장 md5 와 바이트 단위 대조 완료). 내가 새로 쓴 문장은 이 머리말뿐이고
-- SQL 은 한 글자도 손대지 않았다. 이 파일이 적용 시점에 쓰였다는 뜻이 아니다.
--
-- 왜 비어 있었나: 2026-08-11 병렬 세션(검색 미리보기 trgm 작업)이 MCP 로 적용하고
-- 파일 미러링을 남기지 않았다. 같은 세션 4건(20260811064459~065433)을 함께 복원했다.
--
-- 임시 벤치마크 함수 — 본문 머리말대로 측정 직후 DROP 예정이었고, 실제로 20260811065433 이 지웠다. 현재 DB 에 이 함수는 없다.

-- 임시 벤치마크용. 2026-08-11 변경 전 원본과 동일한 본문·언어·속성.
-- 측정 직후 DROP 한다.
CREATE OR REPLACE FUNCTION public.zz_bench_search_preview_v0(p_q text, p_limit integer DEFAULT 8)
 RETURNS TABLE(complex_id text, region_name text, complex_name text, address text,
               trade_count bigint, recent_trade_count bigint, avg_price_manwon bigint,
               avg_area_m2 numeric, build_year integer, households integer,
               lat double precision, lng double precision, sim real, exact boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    public.complex_id(s.region_name, s.complex_name),
    s.region_name, s.complex_name, s.address,
    s.trade_count, s.recent_trade_count,
    s.avg_price_manwon, s.avg_area_m2, s.build_year, s.households,
    g.lat::double precision, g.lng::double precision,
    similarity(s.complex_name, btrim(coalesce(p_q,''))) as sim,
    (s.complex_name ilike btrim(coalesce(p_q,'')) || '%') as exact
  from public.complex_tx_stats s
  left join public.complex_geocode g
    on g.region_name = s.region_name and g.complex_name = s.complex_name and g.status='ok'
  where length(btrim(coalesce(p_q,''))) >= 1
    and (
      s.complex_name ilike '%' || btrim(coalesce(p_q,'')) || '%'
      or similarity(s.complex_name, btrim(coalesce(p_q,''))) > 0.3
    )
  order by
    (s.complex_name ilike btrim(coalesce(p_q,'')) || '%') desc,
    similarity(s.complex_name, btrim(coalesce(p_q,''))) desc,
    s.recent_trade_count desc, s.trade_count desc
  limit greatest(1, least(20, p_limit));
$function$;
REVOKE ALL ON FUNCTION public.zz_bench_search_preview_v0(text,integer) FROM PUBLIC, anon, authenticated;