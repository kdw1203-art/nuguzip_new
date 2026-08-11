-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260811064459, name = search_preview_use_trgm_operator.
-- 아래 본문은 그 원장의 statements 원문 그대로다(md5 cafb440a2c45acd7feec383be9754dc9 · 3073b —
-- 원장 md5 와 바이트 단위 대조 완료). 내가 새로 쓴 문장은 이 머리말뿐이고
-- SQL 은 한 글자도 손대지 않았다. 이 파일이 적용 시점에 쓰였다는 뜻이 아니다.
--
-- 왜 비어 있었나: 2026-08-11 병렬 세션(검색 미리보기 trgm 작업)이 MCP 로 적용하고
-- 파일 미러링을 남기지 않았다. 같은 세션 4건(20260811064459~065433)을 함께 복원했다.
--
-- 되돌리기: 직전 정의의 search_complexes_preview 재적용 — 단, 바로 다음 20260811064922 가 이 정의를 다시 교체했으므로 현재 DB 상태의 직전은 그쪽이다.

-- 2026-08-11 · search_complexes_preview 가 complex_tx_stats_name_trgm(GIN) 을 실제로 타게 한다.
--
-- 기존 WHERE 절의 `similarity(complex_name, q) > 0.3` 은 함수 호출이라 색인 불가다.
-- OR 의 한쪽이 색인 불가면 BitmapOr 를 만들 수 없어 플래너가 통째로 Seq Scan 으로
-- 떨어진다. 그래서 6,096 kB GIN 인덱스가 유지비만 내고 한 번도 안 탔고,
-- index_drop_candidates 에 "미사용" 으로 올라왔다. 원인은 미사용이 아니라 미사용 강제였다.
--
-- 의미가 같은 `%` 연산자로 바꾼다 (similarity >= pg_trgm.similarity_threshold, 기본 0.3).
--
-- 실측 (프로덕션, p_q='래미안', 32,450행)
--   전  Seq Scan   333.5 ms · buffers 853 · 32,232행 필터로 버림
--   후  BitmapOr     8.9 ms · buffers 105
--
-- 동치 확인: 대표 검색어 10개에서 old 3,436행 / new 3,436행 / 차집합 양방향 0건.
--
-- ORDER BY 의 similarity() 는 그대로 둔다 — 매칭된 수백 행에만 걸리므로 비용이 없고,
-- 순위 규칙을 바꾸지 않기 위해서다.

CREATE OR REPLACE FUNCTION public.search_complexes_preview(p_q text, p_limit integer DEFAULT 8)
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
      -- 트라이그램 유사도 — 오타·표기 흔들림 흡수.
      -- similarity(...) > 0.3 이 아니라 `%` 연산자를 쓴다. 의미는 같고(임계 0.3),
      -- 이쪽만 complex_tx_stats_name_trgm(GIN) 을 탈 수 있다. 함수 호출로 쓰면
      -- OR 반대쪽까지 끌고 내려가 매트뷰 전체를 훑는다 — 실측 333ms vs 8.9ms.
      or s.complex_name % btrim(coalesce(p_q,''))
    )
  -- 정렬: 앞글자 일치 > 이름 유사도 > 거래 활발도. 근거 없는 순서를 만들지 않는다.
  order by
    (s.complex_name ilike btrim(coalesce(p_q,'')) || '%') desc,
    similarity(s.complex_name, btrim(coalesce(p_q,''))) desc,
    s.recent_trade_count desc, s.trade_count desc
  limit greatest(1, least(20, p_limit));
$function$;