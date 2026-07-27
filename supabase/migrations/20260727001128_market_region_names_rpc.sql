-- market_transactions 에 실제로 존재하는 region_name 목록 (218개) 을 싸게 열거하는 RPC.
--
-- 배경(2026-07-27 측정): lib/complex/complex-store.ts searchComplexes 가
--   region_name ILIKE '%<구>%'
-- 로 지역을 좁힌다. 앞에 % 가 붙어 어떤 인덱스도 못 타므로
--   · 거래가 많은 구(노원구)  : 2,958 ms  (부분 인덱스 스캔 + 필터)
--   · 거래가 없는 군(울릉군)  : 18,047 ms (전체 병렬 seq scan, 654k행)
-- 이고, service_role 의 statement timeout 이 8초라 후자는 프로덕션에서
--   "market_transactions (단지 검색) 조회 실패: canceling statement due to statement timeout"
-- 으로 잘린다. /complex/[id] 의 "인근 단지" 섹션이 계속 실패로 접히던 원인이다.
--
-- 같은 조회를 region_name 등치(.in)로 바꾸면 mt_trade_complex_geo_idx 를 타서
-- 울릉군 기준 18,047 ms → 8.3 ms 다. 그러려면 "구 이름 → 실제 region_name" 을
-- 알아야 하는데, select distinct region_name 은 8,873 ms 라 그 자체가 타임아웃 감이다.
--
-- 그래서 mt_trade_complex_geo_idx(region_name, complex_name) 위를 건너뛰며 훑는
-- loose index scan 으로 열거한다 — 측정 206 ms. 앱은 이 목록을 캐시해 두고
-- 구 이름 포함 여부를 JS 에서 판정한다(ILIKE '%x%' 와 의미가 같다).
--
-- 값이 아니라 "어떤 지역명이 존재하는가"만 돌려주므로 개인정보·민감정보가 없다.

create or replace function public.market_region_names()
returns table (region_name text)
language sql
stable
security definer
set search_path = public
as $$
  with recursive t as (
    select ''::text as region_name
    union all
    select (
      select m.region_name
        from public.market_transactions m
       where m.transaction_type = 'trade'
         and m.complex_name is not null
         and m.region_name is not null
         and m.region_name > t.region_name
       order by m.region_name
       limit 1
    )
    from t
    where t.region_name is not null
  )
  select t.region_name
    from t
   where t.region_name is not null
     and t.region_name <> ''
   order by 1;
$$;

comment on function public.market_region_names() is
  'market_transactions(trade) 에 존재하는 region_name 목록. searchComplexes 의 앞% ILIKE 를 .in() 등치로 바꾸기 위한 해석표.';

grant execute on function public.market_region_names() to service_role;
grant execute on function public.market_region_names() to authenticated;
grant execute on function public.market_region_names() to anon;
