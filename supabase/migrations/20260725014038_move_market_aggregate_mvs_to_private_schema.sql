-- Supabase 린트 `materialized_view_in_api` 대응.
--
-- MV 는 RLS 를 걸 수 없다. public 스키마에 두고 anon 에게 SELECT 를 주면
-- PostgREST 가 `/rest/v1/tx_band_landing_mv` 로 원본 집계를 그대로 열어준다.
-- 지금 담긴 값이 공개 실거래 집계라 유출 문제는 없지만, 읽는 경로가
-- `*_source` 뷰 하나로 좁혀져 있어야 나중에 뷰에 필터를 걸어도 우회로가 안 생긴다.
--
-- 그래서 MV 는 PostgREST 에 노출되지 않는 private 스키마로 옮기고,
-- 바깥에서 보이는 건 기존 public.*_source 뷰만 남긴다.
-- 뷰는 OID 로 참조하므로 스키마 이동 후에도 그대로 동작한다.
create schema if not exists market_agg;

comment on schema market_agg is
  '실거래 집계 머티리얼라이즈드 뷰 전용. PostgREST 노출 대상이 아니며, 읽기는 public.*_source 뷰로만 한다.';

alter materialized view if exists public.tx_band_landing_mv set schema market_agg;
alter materialized view if exists public.tx_band_complex_mv set schema market_agg;
alter materialized view if exists public.map_price_point_mv  set schema market_agg;

-- security_invoker 뷰를 통해 읽으려면 호출 롤이 스키마 USAGE 를 가져야 한다.
-- USAGE 는 "이 스키마 안의 객체를 이름으로 찾을 수 있다"일 뿐, 노출과 무관하다.
grant usage on schema market_agg to anon, authenticated, service_role;

-- 공개 실거래 집계 — 기존과 동일하게 뷰를 통해 누구나 읽는다.
grant select on market_agg.tx_band_landing_mv to anon, authenticated, service_role;
grant select on market_agg.tx_band_complex_mv to anon, authenticated, service_role;

-- 지도 집계는 complex_geocode(좌표 캐시)를 조인하므로 계속 service_role 전용.
revoke all on market_agg.map_price_point_mv from anon, authenticated;
grant select on market_agg.map_price_point_mv to service_role;

-- 앞으로 이 스키마에 생기는 객체가 실수로 공개되지 않도록 기본 권한을 비운다.
alter default privileges in schema market_agg revoke all on tables from anon, authenticated;

-- 갱신 함수도 새 스키마를 보도록 갱신.
create or replace function public.refresh_market_aggregates()
returns jsonb language plpgsql security definer
set search_path = market_agg, public, pg_temp
set statement_timeout = '280s'
as $$
declare
  t0 timestamptz := clock_timestamp();
  result jsonb;
begin
  refresh materialized view concurrently market_agg.tx_band_landing_mv;
  refresh materialized view concurrently market_agg.tx_band_complex_mv;
  refresh materialized view concurrently market_agg.map_price_point_mv;
  select jsonb_build_object(
    'ok', true, 'refreshed_at', now(),
    'duration_ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int,
    'rows', jsonb_build_object(
      'tx_band_landing', (select count(*) from market_agg.tx_band_landing_mv),
      'tx_band_complex', (select count(*) from market_agg.tx_band_complex_mv),
      'map_price_point', (select count(*) from market_agg.map_price_point_mv))
  ) into result;
  return result;
end;
$$;

revoke all on function public.refresh_market_aggregates() from public, anon, authenticated;
grant execute on function public.refresh_market_aggregates() to service_role;
