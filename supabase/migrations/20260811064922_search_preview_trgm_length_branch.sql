-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260811064922, name = search_preview_trgm_length_branch.
-- 아래 본문은 그 원장의 statements 원문 그대로다(md5 608798190cc8f3f7ee255328ce165e48 · 4146b —
-- 원장 md5 와 바이트 단위 대조 완료). 내가 새로 쓴 문장은 이 머리말뿐이고
-- SQL 은 한 글자도 손대지 않았다. 이 파일이 적용 시점에 쓰였다는 뜻이 아니다.
--
-- 왜 비어 있었나: 2026-08-11 병렬 세션(검색 미리보기 trgm 작업)이 MCP 로 적용하고
-- 파일 미러링을 남기지 않았다. 같은 세션 4건(20260811064459~065433)을 함께 복원했다.
--
-- 되돌리기: 직전 정의(20260811064459 본문의 CREATE OR REPLACE)를 재적용.

-- 2026-08-11 · search_complexes_preview: 트라이그램 인덱스를 "길 때만" 탄다.
--
-- 앞선 마이그레이션(search_preview_use_trgm_operator)이 similarity() 를 `%` 로 바꿔
-- GIN 인덱스를 타게 했다. 3글자 이상에서는 크게 이겼지만 2글자에서 졌다. 실측:
--
--   검색어        기존(Seq)   `%`(GIN)
--   래미안 (3)     127.7 ms      5.7 ms   ← 22배 빠름
--   무지개 (3)     128.3 ms      2.7 ms   ← 47배
--   현대   (2)     127.2 ms    173.8 ms   ← 1.4배 느림
--   자이   (2)     128.1 ms    155.3 ms   ← 1.2배 느림
--   한신   (2)     122.2 ms    152.6 ms   ← 1.2배 느림
--
-- 이유: 2글자는 패딩 포함 트라이그램이 서너 개뿐이라 posting list 가 거대하다.
-- GIN 스캔 자체가 매트뷰 전체를 훑는 것보다 비싸지고, 뽑은 1,034행을 heap recheck
-- 까지 한다. 자동완성은 키를 칠 때마다 뜨므로 2글자 상태가 가장 흔하다 —
-- 거기서 지는 최적화는 최적화가 아니다.
--
-- 그래서 길이로 갈라 각 분기가 자기 계획을 갖게 한다. LANGUAGE sql 은 계획이 하나뿐이라
-- 이 분기를 만들 수 없어 plpgsql 로 바꾼다. STABLE·SECURITY DEFINER·search_path·
-- 반환 타입·정렬·LIMIT·권한은 그대로다. 결과 집합도 그대로다:
--   * 3글자 이상 → `%` (similarity >= 0.3). 대표 검색어 10개에서 기존과 차집합 0건 확인.
--   * 2글자 이하 → 기존 similarity() > 0.3 그대로.

CREATE OR REPLACE FUNCTION public.search_complexes_preview(p_q text, p_limit integer DEFAULT 8)
 RETURNS TABLE(complex_id text, region_name text, complex_name text, address text,
               trade_count bigint, recent_trade_count bigint, avg_price_manwon bigint,
               avg_area_m2 numeric, build_year integer, households integer,
               lat double precision, lng double precision, sim real, exact boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  q   text    := btrim(coalesce(p_q, ''));
  lim integer := greatest(1, least(20, coalesce(p_limit, 8)));
BEGIN
  IF length(q) < 1 THEN
    RETURN;
  END IF;

  IF length(q) >= 3 THEN
    -- 트라이그램이 선택적인 구간. complex_tx_stats_name_trgm(GIN) 을 탄다.
    RETURN QUERY
      select
        public.complex_id(s.region_name, s.complex_name),
        s.region_name, s.complex_name, s.address,
        s.trade_count, s.recent_trade_count,
        s.avg_price_manwon, s.avg_area_m2, s.build_year, s.households,
        g.lat::double precision, g.lng::double precision,
        similarity(s.complex_name, q) as sim,
        (s.complex_name ilike q || '%') as exact
      from public.complex_tx_stats s
      left join public.complex_geocode g
        on g.region_name = s.region_name and g.complex_name = s.complex_name and g.status='ok'
      where s.complex_name ilike '%' || q || '%'
         or s.complex_name % q
      order by
        (s.complex_name ilike q || '%') desc,
        similarity(s.complex_name, q) desc,
        s.recent_trade_count desc, s.trade_count desc
      limit lim;
  ELSE
    -- 1~2글자. 트라이그램 posting list 가 너무 커서 순차 스캔이 더 싸다.
    RETURN QUERY
      select
        public.complex_id(s.region_name, s.complex_name),
        s.region_name, s.complex_name, s.address,
        s.trade_count, s.recent_trade_count,
        s.avg_price_manwon, s.avg_area_m2, s.build_year, s.households,
        g.lat::double precision, g.lng::double precision,
        similarity(s.complex_name, q) as sim,
        (s.complex_name ilike q || '%') as exact
      from public.complex_tx_stats s
      left join public.complex_geocode g
        on g.region_name = s.region_name and g.complex_name = s.complex_name and g.status='ok'
      where s.complex_name ilike '%' || q || '%'
         or similarity(s.complex_name, q) > 0.3
      order by
        (s.complex_name ilike q || '%') desc,
        similarity(s.complex_name, q) desc,
        s.recent_trade_count desc, s.trade_count desc
      limit lim;
  END IF;
END;
$function$;