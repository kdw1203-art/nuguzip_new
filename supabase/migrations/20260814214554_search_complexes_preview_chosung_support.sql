-- [2026-08-14] 단지 자동완성 초성 검색 지원.
--
-- 배경(제품 리뷰 실측): "ㄹㅁㅇ" 같은 초성 입력이 0건이었다 — 오타 내성(트라이그램)은
-- 이미 있었지만(래미안↔레미안), 초성은 어떤 브랜치에도 걸리지 않았다. 한국어
-- 아파트명 조회에서 초성 검색은 표준 기대 동작이다.
--
-- 구현:
--  1) public.hangul_chosung(text) — 한글 음절(가-힣)을 초성으로 치환, 그 외 문자는
--     그대로 통과(IMMUTABLE·PARALLEL SAFE). "래미안2차" → "ㄹㅁㅇ2ㅊ".
--  2) search_complexes_preview 에 자모 전용 질의 브랜치 추가: q 가 자모(ㄱ-ㅎㅏ-ㅣ)로만
--     이루어지면 초성열 LIKE 매칭(접두 우선 → 최근 거래 활발도순). 대상 32,484행
--     (2026-08-14 실측) 함수 스캔 — 자동완성 캐시(s-maxage=3600)와 결합해 수용 가능.
--     자모 질의는 기존 브랜치에서 어차피 0건이므로 동작 회귀가 없다.
--
-- 롤백: 이 파일의 RPC 를 직전 판(20260811064922 계열)으로 되돌리고
--       drop function public.hangul_chosung(text);
create or replace function public.hangul_chosung(t text)
returns text
language plpgsql
immutable
parallel safe
set search_path to 'pg_catalog'
as $$
declare
  res text := '';
  cp  int;
  i   int;
  cho constant text[] := array[
    'ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ',
    'ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
begin
  if t is null or t = '' then return t; end if;
  for i in 1..char_length(t) loop
    cp := ascii(substr(t, i, 1));
    if cp between 44032 and 55203 then
      res := res || cho[((cp - 44032) / 588) + 1];
    else
      res := res || substr(t, i, 1);
    end if;
  end loop;
  return res;
end;
$$;

revoke all on function public.hangul_chosung(text) from public, anon, authenticated;

create or replace function public.search_complexes_preview(p_q text, p_limit integer default 8)
 returns table(complex_id text, region_name text, complex_name text, address text, trade_count bigint, recent_trade_count bigint, avg_price_manwon bigint, avg_area_m2 numeric, build_year integer, households integer, lat double precision, lng double precision, sim real, exact boolean)
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  q   text    := btrim(coalesce(p_q, ''));
  lim integer := greatest(1, least(20, coalesce(p_limit, 8)));
begin
  if length(q) < 1 then
    return;
  end if;

  -- [2026-08-14 신설] 자모 전용 질의 = 초성 검색.
  -- "ㄹㅁㅇ" → hangul_chosung(단지명) 에 대해 접두 우선 LIKE.
  -- 1글자 자모는 posting 이 너무 넓어(ㅇ 하나로 수천 건) 2글자부터 연다.
  if q ~ '^[ㄱ-ㅎㅏ-ㅣ]+$' and length(q) >= 2 then
    return query
      select
        public.complex_id(s.region_name, s.complex_name),
        s.region_name, s.complex_name, s.address,
        s.trade_count, s.recent_trade_count,
        s.avg_price_manwon, s.avg_area_m2, s.build_year, s.households,
        g.lat::double precision, g.lng::double precision,
        0::real as sim,
        (public.hangul_chosung(s.complex_name) like q || '%') as exact
      from public.complex_tx_stats s
      left join public.complex_geocode g
        on g.region_name = s.region_name and g.complex_name = s.complex_name and g.status='ok'
      where public.hangul_chosung(s.complex_name) like '%' || q || '%'
      order by
        (public.hangul_chosung(s.complex_name) like q || '%') desc,
        s.recent_trade_count desc, s.trade_count desc
      limit lim;
    return;
  end if;

  if length(q) >= 3 then
    -- 트라이그램이 선택적인 구간. complex_tx_stats_name_trgm(GIN) 을 탄다.
    return query
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
  else
    -- 1~2글자. 트라이그램 posting list 가 너무 커서 순차 스캔이 더 싸다.
    return query
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
  end if;
end;
$function$;