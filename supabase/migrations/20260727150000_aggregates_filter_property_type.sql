-- 시세 집계에 property_type = 'apartment' 조건을 명시한다 (2026-07-27).
--
-- ── 왜 ──────────────────────────────────────────────────────────────────────
-- market_transactions 는 지금 100% property_type='apartment' 다(654,815행 전부).
-- 그래서 아래 집계들은 조건을 안 걸고도 결과가 옳았다. 문제는 그 전제가
-- **암묵적**이라는 것이다.
--
-- 국토부 실거래 API 는 오피스텔(RTMSDataSvcOffiTrade)·연립다세대
-- (RTMSDataSvcRHTrade)도 준다. lib/national-data/molit-api.ts 는 이미 두 유형을
-- 지원하고, 지도 필터에도 "오피스텔·빌라는 준비 중"이라고 적혀 있다. 즉 언젠가
-- 켜진다. 그날 이 조건이 없으면 지도 색상·평단가·구간 페이지·단지 통계가 조용히
-- 아파트와 오피스텔을 섞어 평균 낸다 — 화면 어디에도 드러나지 않고, 숫자는
-- 그럴듯하게 틀린다. 지도 좌측 패널의 "평균 매매가"가 대표적이다.
--
-- 적용해도 결과는 한 행도 바뀌지 않는다. 적용 전후 행 수 실측 대조:
--   complex_tx_stats  32,030 → 32,030
--   map_price_point_mv 25,198 → 25,198
--   tx_band_landing_mv  1,650 →  1,650
--   tx_band_complex_mv 69,634 → 69,634
--   complex_sitemap_mv 25,310 → 25,310
--
-- ── GRANT ───────────────────────────────────────────────────────────────────
-- 머티리얼라이즈드 뷰에는 CREATE OR REPLACE 가 없어 drop + create 뿐이고,
-- drop 이 GRANT 를 함께 지운다. 아래에서 원래 권한 그대로 다시 적는다
-- (scripts/check-migration-grants.mjs 가 이걸 강제한다).
-- public 스키마에 새로 만드는 객체에는 Supabase 기본 권한 때문에
-- anon/authenticated 에게 ALL 이 붙는다 — complex_tx_stats 는 원래 service_role
-- 전용이었으므로 마지막에 명시적으로 revoke 해 원래 상태로 되돌린다.
--
-- 운영 적용 방식: 파트별로 나눠 실행했다. complex_tx_stats 재생성만 약 3분이
-- 걸려서(32,030 단지 × 65만 거래 집계) 한 트랜잭션에 다 넣으면 커넥션 타임아웃에
-- 걸린다. 각 파트는 독립적이라 순서만 지키면 나눠 실행해도 안전하다.


-- ===== part 1 — 지도 시세 포인트 =====
drop materialized view if exists market_agg.map_price_point_mv cascade;

create materialized view market_agg.map_price_point_mv as
with tx as (
  select
    region_name,
    complex_name,
    count(*)::integer as tx_count,
    avg(price_per_pyeong_krw) as avg_per_pyeong_krw,
    percentile_cont(0.5) within group (order by price_per_pyeong_krw::double precision) as median_per_pyeong_krw,
    avg(deal_amount_krw) as avg_krw,
    percentile_cont(0.5) within group (order by deal_amount_krw::double precision) as median_krw,
    avg(area_m2) as avg_area_m2,
    min(contract_ym) as first_ym,
    max(contract_ym) as latest_ym,
    max(updated_at) as last_data_at
  from market_transactions
  where property_type = 'apartment'
    and transaction_type = 'trade'
    and is_cancelled = false
    and price_per_pyeong_krw is not null and price_per_pyeong_krw > 0
    and deal_amount_krw is not null and deal_amount_krw > 0
  group by region_name, complex_name
)
select
  g.region_name, g.complex_name, g.lat, g.lng, tx.tx_count,
  round(tx.avg_per_pyeong_krw)::bigint as avg_per_pyeong_krw,
  round(tx.median_per_pyeong_krw::numeric)::bigint as median_per_pyeong_krw,
  round(tx.avg_krw)::bigint as avg_krw,
  round(tx.median_krw::numeric)::bigint as median_krw,
  round(tx.avg_area_m2, 1) as avg_area_m2,
  tx.first_ym, tx.latest_ym, tx.last_data_at
from complex_geocode g
join tx on tx.region_name = g.region_name and tx.complex_name = g.complex_name
where g.status = 'ok' and g.lat is not null and g.lng is not null;

create unique index map_price_point_mv_key on market_agg.map_price_point_mv (region_name, complex_name);
create index map_price_point_mv_latlng on market_agg.map_price_point_mv (lat, lng);
create index map_price_point_mv_txcount on market_agg.map_price_point_mv (tx_count desc);

grant select on market_agg.map_price_point_mv to service_role;

create or replace view public.map_price_point_source as
  select region_name, complex_name, lat, lng, tx_count, avg_per_pyeong_krw,
         median_per_pyeong_krw, avg_krw, median_krw, avg_area_m2,
         first_ym, latest_ym, last_data_at
  from market_agg.map_price_point_mv;

grant select on public.map_price_point_source to anon, authenticated, service_role;

-- ===== part 2 — 단지 사이트맵 =====
drop materialized view if exists market_agg.complex_sitemap_mv cascade;

create materialized view market_agg.complex_sitemap_mv as
select
  region_name, complex_name,
  max(contract_ym) as last_contract_ym,
  max(created_at) as last_data_at,
  count(*)::integer as trade_count
from market_transactions
where property_type = 'apartment'
  and transaction_type = 'trade'
  and is_cancelled = false
  and complex_name is not null
  and region_name is not null
group by region_name, complex_name;

create unique index complex_sitemap_mv_key on market_agg.complex_sitemap_mv (region_name, complex_name);
create index complex_sitemap_mv_rank on market_agg.complex_sitemap_mv (trade_count desc, region_name, complex_name)
  include (last_data_at, last_contract_ym);

grant select on market_agg.complex_sitemap_mv to service_role;

create or replace view public.complex_sitemap_source as
  select region_name, complex_name, last_contract_ym, last_data_at, trade_count
  from market_agg.complex_sitemap_mv;

grant select on public.complex_sitemap_source to anon, authenticated, service_role;

-- ===== part 3 — 지역 구간(밴드) 랜딩 =====
drop materialized view if exists market_agg.tx_band_landing_mv cascade;

create materialized view market_agg.tx_band_landing_mv as
with base as (
  select region_name, complex_name, area_m2, deal_amount_krw, price_per_pyeong_krw, contract_ym, created_at
  from market_transactions
  where property_type = 'apartment'
    and transaction_type = 'trade'
    and is_cancelled = false
    and deal_amount_krw > 0
    and region_name is not null
), tagged as (
  select 'area'::text as band_kind,
    case
      when b.area_m2 < 60 then 'under-60'
      when b.area_m2 < 85.5 then '60-85'
      when b.area_m2 < 102 then '85-102'
      when b.area_m2 < 135 then '102-135'
      else 'over-135'
    end as band_key,
    b.region_name, b.complex_name, b.area_m2, b.deal_amount_krw, b.price_per_pyeong_krw, b.contract_ym, b.created_at
  from base b where b.area_m2 is not null
  union all
  select 'price'::text as band_kind,
    case
      when b.deal_amount_krw < 300000000 then 'under-3eok'
      when b.deal_amount_krw < 600000000 then '3-6eok'
      when b.deal_amount_krw < 900000000 then '6-9eok'
      when b.deal_amount_krw < 1500000000 then '9-15eok'
      else 'over-15eok'
    end as band_key,
    b.region_name, b.complex_name, b.area_m2, b.deal_amount_krw, b.price_per_pyeong_krw, b.contract_ym, b.created_at
  from base b
)
select
  region_name, band_kind, band_key,
  count(*)::integer as tx_count,
  count(distinct complex_name)::integer as complex_count,
  round(avg(deal_amount_krw))::bigint as avg_krw,
  min(deal_amount_krw) as min_krw,
  max(deal_amount_krw) as max_krw,
  round(percentile_cont(0.5) within group (order by deal_amount_krw::double precision))::bigint as median_krw,
  round(avg(area_m2), 1) as avg_area_m2,
  round(avg(price_per_pyeong_krw))::bigint as avg_per_pyeong_krw,
  min(contract_ym) as first_ym,
  max(contract_ym) as latest_ym,
  max(created_at) as last_data_at
from tagged
group by region_name, band_kind, band_key;

create unique index tx_band_landing_mv_key on market_agg.tx_band_landing_mv (region_name, band_kind, band_key);

grant select on market_agg.tx_band_landing_mv to anon, authenticated, service_role;

create or replace view public.tx_band_landing_source as
  select region_name, band_kind, band_key, tx_count, complex_count, avg_krw, min_krw, max_krw,
         median_krw, avg_area_m2, avg_per_pyeong_krw, first_ym, latest_ym, last_data_at
  from market_agg.tx_band_landing_mv;

grant select on public.tx_band_landing_source to anon, authenticated, service_role;

-- ===== part 4 — 단지별 구간(밴드) =====
drop materialized view if exists market_agg.tx_band_complex_mv cascade;

create materialized view market_agg.tx_band_complex_mv as
with base as (
  select region_name, complex_name, area_m2, deal_amount_krw, contract_ym
  from market_transactions
  where property_type = 'apartment'
    and transaction_type = 'trade'
    and is_cancelled = false
    and deal_amount_krw > 0
    and region_name is not null
    and complex_name is not null
), tagged as (
  select 'area'::text as band_kind,
    case
      when b.area_m2 < 60 then 'under-60'
      when b.area_m2 < 85.5 then '60-85'
      when b.area_m2 < 102 then '85-102'
      when b.area_m2 < 135 then '102-135'
      else 'over-135'
    end as band_key,
    b.region_name, b.complex_name, b.area_m2, b.deal_amount_krw, b.contract_ym
  from base b where b.area_m2 is not null
  union all
  select 'price'::text as band_kind,
    case
      when b.deal_amount_krw < 300000000 then 'under-3eok'
      when b.deal_amount_krw < 600000000 then '3-6eok'
      when b.deal_amount_krw < 900000000 then '6-9eok'
      when b.deal_amount_krw < 1500000000 then '9-15eok'
      else 'over-15eok'
    end as band_key,
    b.region_name, b.complex_name, b.area_m2, b.deal_amount_krw, b.contract_ym
  from base b
)
select
  region_name, band_kind, band_key, complex_name,
  count(*)::integer as tx_count,
  round(avg(deal_amount_krw))::bigint as avg_krw,
  max(deal_amount_krw) as max_krw,
  min(deal_amount_krw) as min_krw,
  round(avg(area_m2), 1) as avg_area_m2,
  max(contract_ym) as latest_ym
from tagged
group by region_name, band_kind, band_key, complex_name;

create unique index tx_band_complex_mv_key on market_agg.tx_band_complex_mv (region_name, band_kind, band_key, complex_name);
create index tx_band_complex_mv_band on market_agg.tx_band_complex_mv (region_name, band_kind, band_key, tx_count desc);

grant select on market_agg.tx_band_complex_mv to anon, authenticated, service_role;

create or replace view public.tx_band_complex_source as
  select region_name, band_kind, band_key, complex_name, tx_count, avg_krw, max_krw, min_krw,
         avg_area_m2, latest_ym
  from market_agg.tx_band_complex_mv;

grant select on public.tx_band_complex_source to anon, authenticated, service_role;

-- ===== part 5 — 단지 통계 (지오코딩 우선순위·인기 단지·상세 필터의 원천) =====
-- 여기 avg_price_manwon 은 지도 좌측 패널과 검색 미리보기에 그대로 나가는 값이라,
-- 오피스텔이 섞이면 화면에 뜨는 "평균 매매가"가 소리 없이 틀린다.
-- 재생성에 약 3분 걸린다 — 위 파트들과 별도 트랜잭션으로 실행할 것.
drop materialized view if exists public.complex_tx_stats cascade;

create materialized view public.complex_tx_stats as
with tx as (
  select
    mt.region_name,
    mt.complex_name,
    min(mt.address) filter (where mt.address is not null and mt.address <> '') as address,
    count(*) filter (where mt.transaction_type = 'trade' and coalesce(mt.is_cancelled, false) = false) as trade_count,
    count(*) filter (where coalesce(mt.is_cancelled, false) = false) as tx_count,
    count(*) filter (
      where mt.transaction_type = 'trade'
        and coalesce(mt.is_cancelled, false) = false
        and mt.contract_ym >= to_char(now() - interval '6 mons', 'YYYYMM')
    ) as recent_trade_count,
    round(avg(mt.deal_amount_krw::numeric / 10000.0) filter (
      where mt.transaction_type = 'trade'
        and coalesce(mt.is_cancelled, false) = false
        and mt.deal_amount_krw is not null
    ))::bigint as avg_price_manwon,
    round(avg(mt.area_m2) filter (
      where mt.transaction_type = 'trade'
        and coalesce(mt.is_cancelled, false) = false
        and mt.area_m2 > 0
    ), 1) as avg_area_m2,
    max(mt.build_year) filter (where mt.build_year >= 1950 and mt.build_year <= 2100) as build_year
  from market_transactions mt
  where mt.property_type = 'apartment'
    and mt.complex_name is not null and mt.complex_name <> ''
    and mt.region_name is not null and mt.region_name <> ''
  group by mt.region_name, mt.complex_name
), master as (
  select
    replace(name, ' ', '') as norm_name,
    max((metadata ->> 'householdCount')::integer) as households
  from apartment_complexes
  where source_key = 'k-apt-basic'
    and (metadata -> 'detailFetchedAt') is not null
    and (metadata ->> 'householdCount') ~ '^[0-9]+$'
  group by replace(name, ' ', '')
)
select
  tx.region_name, tx.complex_name, tx.address, tx.trade_count, tx.tx_count,
  tx.recent_trade_count, tx.avg_price_manwon, tx.avg_area_m2, tx.build_year, m.households
from tx
left join master m on m.norm_name = replace(tx.complex_name, ' ', '');

create unique index complex_tx_stats_pk on public.complex_tx_stats (region_name, complex_name);
create index complex_tx_stats_priority_idx on public.complex_tx_stats (trade_count desc, tx_count desc);
create index complex_tx_stats_recent_idx on public.complex_tx_stats (recent_trade_count desc, trade_count desc);
create index complex_tx_stats_name_trgm on public.complex_tx_stats using gin (complex_name extensions.gin_trgm_ops);

-- public 스키마 기본 권한으로 anon/authenticated 에게 **ALL** 이 붙는다.
-- 쓰기 권한까지 주는 건 과하므로 일단 전부 회수하고 필요한 것만 다시 준다.
revoke all on public.complex_tx_stats from anon, authenticated;
grant select on public.complex_tx_stats to service_role;

/* anon 읽기를 여는 이유.
   원래 이 MV 는 service_role 전용이었다. 그런데 /api/map/clusters 가 지도 마커의
   상세 필터 속성(가격·면적·준공·세대수)을 여기서 읽는데, getReadOnlySupabase 는
   서비스 롤 키가 없으면 anon 으로 물러선다. 그러면 조회가 42501 로 실패하고,
   필터를 켠 순간 마커가 전부 사라진다 — 로컬·프리뷰에서 실제로 그랬다.
   같은 행들은 이미 popular_complexes() · map_filter_facets() ·
   search_complexes_preview() 세 SECURITY DEFINER 함수를 통해 익명 사용자에게
   그대로 나가고 있다. 즉 새로 공개되는 정보는 없고, 조용히 망가지는 경로만
   하나 사라진다. 쓰기는 여전히 불가(MV 는 애초에 쓸 수 없다). */
grant select on public.complex_tx_stats to anon, authenticated;
