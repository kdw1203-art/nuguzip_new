-- 실거래 집계를 머티리얼라이즈드 뷰로 고정한다.
--
-- 왜: tx_band_landing_source / tx_band_complex_source / map_price_point_source
-- 는 모두 market_transactions(68,126행) 전체를 매 요청마다 seq scan + 집계했다.
-- 실측: 지도 집계 1,636ms(warm), 밴드 집계는 anon 의 statement_timeout(3s)을
-- 넘겨 취소됨. 그 결과
--   · /tx 는 빌드 프리렌더에서 빈 배열을 받아 "불러오지 못했습니다"가 1시간 고정
--   · /api/map/clusters 는 priceMeta 가 전부 0 이라 모든 마커가 회색
-- 집계 대상은 월 1회(molit ingest) 갱신되는 확정 실거래라 실시간일 필요가 없다.
-- 뷰 이름과 컬럼은 그대로 두고 내용만 MV 로 바꿔 호출부 수정 없이 교체한다.
-- 파괴적 변경 없음: 원본 테이블은 건드리지 않고 집계 캐시만 추가한다.
--
-- 주의: 이 파일이 만든 MV 는 이후 20260725014038 에서 market_agg 스키마로 옮겨진다.

create materialized view if not exists public.tx_band_landing_mv as
with base as (
  select region_name, complex_name, area_m2, deal_amount_krw,
         price_per_pyeong_krw, contract_ym, created_at
  from public.market_transactions
  where transaction_type = 'trade' and deal_amount_krw > 0 and region_name is not null
), tagged as (
  select 'area'::text as band_kind,
         case when b.area_m2 < 60::numeric then 'under-60'::text
              when b.area_m2 < 85.5 then '60-85'::text
              when b.area_m2 < 102::numeric then '85-102'::text
              when b.area_m2 < 135::numeric then '102-135'::text
              else 'over-135'::text end as band_key,
         b.region_name, b.complex_name, b.area_m2, b.deal_amount_krw,
         b.price_per_pyeong_krw, b.contract_ym, b.created_at
  from base b where b.area_m2 is not null
  union all
  select 'price'::text as band_kind,
         case when b.deal_amount_krw < 300000000 then 'under-3eok'::text
              when b.deal_amount_krw < 600000000 then '3-6eok'::text
              when b.deal_amount_krw < 900000000 then '6-9eok'::text
              when b.deal_amount_krw < 1500000000 then '9-15eok'::text
              else 'over-15eok'::text end as band_key,
         b.region_name, b.complex_name, b.area_m2, b.deal_amount_krw,
         b.price_per_pyeong_krw, b.contract_ym, b.created_at
  from base b
)
select region_name, band_kind, band_key,
       count(*)::integer as tx_count,
       count(distinct complex_name)::integer as complex_count,
       round(avg(deal_amount_krw))::bigint as avg_krw,
       min(deal_amount_krw) as min_krw,
       max(deal_amount_krw) as max_krw,
       round(percentile_cont(0.5::double precision) within group (order by (deal_amount_krw::double precision)))::bigint as median_krw,
       round(avg(area_m2), 1) as avg_area_m2,
       round(avg(price_per_pyeong_krw))::bigint as avg_per_pyeong_krw,
       min(contract_ym) as first_ym,
       max(contract_ym) as latest_ym,
       max(created_at) as last_data_at
from tagged group by region_name, band_kind, band_key;

create materialized view if not exists public.tx_band_complex_mv as
with base as (
  select region_name, complex_name, area_m2, deal_amount_krw, contract_ym
  from public.market_transactions
  where transaction_type = 'trade' and deal_amount_krw > 0
    and region_name is not null and complex_name is not null
), tagged as (
  select 'area'::text as band_kind,
         case when b.area_m2 < 60::numeric then 'under-60'::text
              when b.area_m2 < 85.5 then '60-85'::text
              when b.area_m2 < 102::numeric then '85-102'::text
              when b.area_m2 < 135::numeric then '102-135'::text
              else 'over-135'::text end as band_key,
         b.region_name, b.complex_name, b.area_m2, b.deal_amount_krw, b.contract_ym
  from base b where b.area_m2 is not null
  union all
  select 'price'::text as band_kind,
         case when b.deal_amount_krw < 300000000 then 'under-3eok'::text
              when b.deal_amount_krw < 600000000 then '3-6eok'::text
              when b.deal_amount_krw < 900000000 then '6-9eok'::text
              when b.deal_amount_krw < 1500000000 then '9-15eok'::text
              else 'over-15eok'::text end as band_key,
         b.region_name, b.complex_name, b.area_m2, b.deal_amount_krw, b.contract_ym
  from base b
)
select region_name, band_kind, band_key, complex_name,
       count(*)::integer as tx_count,
       round(avg(deal_amount_krw))::bigint as avg_krw,
       max(deal_amount_krw) as max_krw,
       min(deal_amount_krw) as min_krw,
       round(avg(area_m2), 1) as avg_area_m2,
       max(contract_ym) as latest_ym
from tagged group by region_name, band_kind, band_key, complex_name;

create materialized view if not exists public.map_price_point_mv as
with tx as (
  select region_name, complex_name,
         count(*)::integer as tx_count,
         avg(price_per_pyeong_krw) as avg_per_pyeong_krw,
         percentile_cont(0.5) within group (order by price_per_pyeong_krw::float8) as median_per_pyeong_krw,
         avg(deal_amount_krw) as avg_krw,
         percentile_cont(0.5) within group (order by deal_amount_krw::float8) as median_krw,
         avg(area_m2) as avg_area_m2,
         min(contract_ym) as first_ym, max(contract_ym) as latest_ym,
         max(updated_at) as last_data_at
  from public.market_transactions
  where transaction_type = 'trade'
    and price_per_pyeong_krw is not null and price_per_pyeong_krw > 0
    and deal_amount_krw is not null and deal_amount_krw > 0
  group by region_name, complex_name
)
select g.region_name, g.complex_name, g.lat, g.lng, tx.tx_count,
       round(tx.avg_per_pyeong_krw)::bigint as avg_per_pyeong_krw,
       round(tx.median_per_pyeong_krw::numeric)::bigint as median_per_pyeong_krw,
       round(tx.avg_krw)::bigint as avg_krw,
       round(tx.median_krw::numeric)::bigint as median_krw,
       round(tx.avg_area_m2, 1) as avg_area_m2,
       tx.first_ym, tx.latest_ym, tx.last_data_at
from public.complex_geocode g
join tx on tx.region_name = g.region_name and tx.complex_name = g.complex_name
where g.status = 'ok' and g.lat is not null and g.lng is not null;

-- CONCURRENTLY 갱신에 필요한 유니크 인덱스 + 조회 인덱스
create unique index if not exists tx_band_landing_mv_key
  on public.tx_band_landing_mv (region_name, band_kind, band_key);
create unique index if not exists tx_band_complex_mv_key
  on public.tx_band_complex_mv (region_name, band_kind, band_key, complex_name);
create index if not exists tx_band_complex_mv_band
  on public.tx_band_complex_mv (region_name, band_kind, band_key, tx_count desc);
create unique index if not exists map_price_point_mv_key
  on public.map_price_point_mv (region_name, complex_name);
-- 지도는 bbox(lat/lng) 로만 자른다. 기존 complex_geocode 에는 좌표 인덱스가 없었다.
create index if not exists map_price_point_mv_latlng
  on public.map_price_point_mv (lat, lng);
create index if not exists map_price_point_mv_txcount
  on public.map_price_point_mv (tx_count desc);
