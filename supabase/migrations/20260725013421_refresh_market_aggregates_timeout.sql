-- 실측 갱신 시간 8.75초. PostgREST 로 들어오는 service_role 은 authenticator 의
-- statement_timeout(8초)을 물려받아 그대로면 취소된다. 함수 수준 SET 으로
-- 이 함수가 실행되는 동안에만 여유를 준다(크론 maxDuration 300초와 맞춤).
-- (최종 본문은 20260725014038 에서 market_agg 스키마를 보도록 다시 갱신된다)
create or replace function public.refresh_market_aggregates()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
set statement_timeout = '280s'
as $$
declare
  t0 timestamptz := clock_timestamp();
  result jsonb;
begin
  refresh materialized view concurrently public.tx_band_landing_mv;
  refresh materialized view concurrently public.tx_band_complex_mv;
  refresh materialized view concurrently public.map_price_point_mv;
  select jsonb_build_object(
    'ok', true, 'refreshed_at', now(),
    'duration_ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int,
    'rows', jsonb_build_object(
      'tx_band_landing', (select count(*) from public.tx_band_landing_mv),
      'tx_band_complex', (select count(*) from public.tx_band_complex_mv),
      'map_price_point', (select count(*) from public.map_price_point_mv))
  ) into result;
  return result;
end;
$$;

revoke all on function public.refresh_market_aggregates() from public, anon, authenticated;
grant execute on function public.refresh_market_aggregates() to service_role;
