-- #150 — 해제(취소)된 실거래를 집계에서 제외한다.
--
-- 원격 DB 에 이미 적용된 마이그레이션의 사본이다(supabase/migrations/README.md 규약).
-- version 20260725042708 = supabase_migrations.schema_migrations 의 값과 정확히 일치.
--
-- market_transactions.is_cancelled 를 추가·백필했으므로(마이그레이션
-- market_transactions_is_cancelled), 이 값을 읽는 쪽에 반영한다. 대상은
-- 실거래 집계 MV 3개와 사이트맵 소스 뷰 1개다.
--
-- MV 는 CREATE OR REPLACE 가 없어 drop 후 재생성해야 한다. MV 를 참조하는 public
-- 뷰 3개도 함께 내렸다가 **컬럼 구성을 그대로** 다시 만든다(앱 조회 코드 불변).
-- MV 데이터는 market_transactions 에서 파생된 값이라 재생성 시 유실이 없다.
-- 재생성 직후 채워 두므로 크론(refresh_market_aggregates)을 기다릴 필요도 없다.
-- CONCURRENTLY 재계산에 필요한 UNIQUE 인덱스도 원본과 동일하게 복원한다.

drop view if exists public.map_price_point_source;
drop view if exists public.tx_band_complex_source;
drop view if exists public.tx_band_landing_source;

drop materialized view if exists market_agg.map_price_point_mv;
drop materialized view if exists market_agg.tx_band_complex_mv;
drop materialized view if exists market_agg.tx_band_landing_mv;

-- ── 1) 지역×구간 랜딩 집계 ────────────────────────────────────────────
create materialized view market_agg.tx_band_landing_mv as
with base as (
  select region_name, complex_name, area_m2, deal_amount_krw,
         price_per_pyeong_krw, contract_ym, created_at
    from public.market_transactions
   where transaction_type = 'trade'
     and is_cancelled = false
     and deal_amount_krw > 0
     and region_name is not null
), tagged as (
  select 'area'::text as band_kind,
         case when b.area_m2 < 60   then 'under-60'
              when b.area_m2 < 85.5 then '60-85'
              when b.area_m2 < 102  then '85-102'
              when b.area_m2 < 135  then '102-135'
              else 'over-135' end as band_key,
         b.region_name, b.complex_name, b.area_m2, b.deal_amount_krw,
         b.price_per_pyeong_krw, b.contract_ym, b.created_at
    from base b
   where b.area_m2 is not null
  union all
  select 'price'::text as band_kind,
         case when b.deal_amount_krw <  300000000 then 'under-3eok'
              when b.deal_amount_krw <  600000000 then '3-6eok'
              when b.deal_amount_krw <  900000000 then '6-9eok'
              when b.deal_amount_krw < 1500000000 then '9-15eok'
              else 'over-15eok' end as band_key,
         b.region_name, b.complex_name, b.area_m2, b.deal_amount_krw,
         b.price_per_pyeong_krw, b.contract_ym, b.created_at
    from base b
)
select region_name,
       band_kind,
       band_key,
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

create unique index tx_band_landing_mv_key
  on market_agg.tx_band_landing_mv (region_name, band_kind, band_key);

-- ── 2) 지역×구간 안의 단지별 집계 ─────────────────────────────────────
create materialized view market_agg.tx_band_complex_mv as
with base as (
  select region_name, complex_name, area_m2, deal_amount_krw, contract_ym
    from public.market_transactions
   where transaction_type = 'trade'
     and is_cancelled = false
     and deal_amount_krw > 0
     and region_name is not null
     and complex_name is not null
), tagged as (
  select 'area'::text as band_kind,
         case when b.area_m2 < 60   then 'under-60'
              when b.area_m2 < 85.5 then '60-85'
              when b.area_m2 < 102  then '85-102'
              when b.area_m2 < 135  then '102-135'
              else 'over-135' end as band_key,
         b.region_name, b.complex_name, b.area_m2, b.deal_amount_krw, b.contract_ym
    from base b
   where b.area_m2 is not null
  union all
  select 'price'::text as band_kind,
         case when b.deal_amount_krw <  300000000 then 'under-3eok'
              when b.deal_amount_krw <  600000000 then '3-6eok'
              when b.deal_amount_krw <  900000000 then '6-9eok'
              when b.deal_amount_krw < 1500000000 then '9-15eok'
              else 'over-15eok' end as band_key,
         b.region_name, b.complex_name, b.area_m2, b.deal_amount_krw, b.contract_ym
    from base b
)
select region_name,
       band_kind,
       band_key,
       complex_name,
       count(*)::integer as tx_count,
       round(avg(deal_amount_krw))::bigint as avg_krw,
       max(deal_amount_krw) as max_krw,
       min(deal_amount_krw) as min_krw,
       round(avg(area_m2), 1) as avg_area_m2,
       max(contract_ym) as latest_ym
  from tagged
 group by region_name, band_kind, band_key, complex_name;

create unique index tx_band_complex_mv_key
  on market_agg.tx_band_complex_mv (region_name, band_kind, band_key, complex_name);
create index tx_band_complex_mv_band
  on market_agg.tx_band_complex_mv (region_name, band_kind, band_key, tx_count desc);

-- ── 3) 지도 가격 포인트(좌표 조인) ────────────────────────────────────
create materialized view market_agg.map_price_point_mv as
with tx as (
  select region_name,
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
    from public.market_transactions
   where transaction_type = 'trade'
     and is_cancelled = false
     and price_per_pyeong_krw is not null
     and price_per_pyeong_krw > 0
     and deal_amount_krw is not null
     and deal_amount_krw > 0
   group by region_name, complex_name
)
select g.region_name,
       g.complex_name,
       g.lat,
       g.lng,
       tx.tx_count,
       round(tx.avg_per_pyeong_krw)::bigint as avg_per_pyeong_krw,
       round(tx.median_per_pyeong_krw::numeric)::bigint as median_per_pyeong_krw,
       round(tx.avg_krw)::bigint as avg_krw,
       round(tx.median_krw::numeric)::bigint as median_krw,
       round(tx.avg_area_m2, 1) as avg_area_m2,
       tx.first_ym,
       tx.latest_ym,
       tx.last_data_at
  from public.complex_geocode g
  join tx on tx.region_name = g.region_name and tx.complex_name = g.complex_name
 where g.status = 'ok' and g.lat is not null and g.lng is not null;

create unique index map_price_point_mv_key
  on market_agg.map_price_point_mv (region_name, complex_name);
create index map_price_point_mv_latlng
  on market_agg.map_price_point_mv (lat, lng);
create index map_price_point_mv_txcount
  on market_agg.map_price_point_mv (tx_count desc);

-- ── 4) public 뷰 재생성 (컬럼 구성·security_invoker 동일) ─────────────
create view public.tx_band_landing_source with (security_invoker = on) as
  select region_name, band_kind, band_key, tx_count, complex_count, avg_krw,
         min_krw, max_krw, median_krw, avg_area_m2, avg_per_pyeong_krw,
         first_ym, latest_ym, last_data_at
    from market_agg.tx_band_landing_mv;

create view public.tx_band_complex_source with (security_invoker = on) as
  select region_name, band_kind, band_key, complex_name, tx_count, avg_krw,
         max_krw, min_krw, avg_area_m2, latest_ym
    from market_agg.tx_band_complex_mv;

create view public.map_price_point_source with (security_invoker = on) as
  select region_name, complex_name, lat, lng, tx_count, avg_per_pyeong_krw,
         median_per_pyeong_krw, avg_krw, median_krw, avg_area_m2,
         first_ym, latest_ym, last_data_at
    from market_agg.map_price_point_mv;

grant select on public.tx_band_landing_source to anon, authenticated, service_role;
grant select on public.tx_band_complex_source to anon, authenticated, service_role;
grant select on public.map_price_point_source to anon, authenticated, service_role;

-- ── 5) 사이트맵 소스 뷰 — 해제 거래는 단지 존재 근거로 쓰지 않는다 ────
create or replace view public.complex_sitemap_source with (security_invoker = on) as
  select region_name,
         complex_name,
         max(contract_ym) as last_contract_ym,
         max(created_at) as last_data_at,
         count(*)::integer as trade_count
    from public.market_transactions
   where transaction_type = 'trade'
     and is_cancelled = false
     and complex_name is not null
     and region_name is not null
   group by region_name, complex_name;
