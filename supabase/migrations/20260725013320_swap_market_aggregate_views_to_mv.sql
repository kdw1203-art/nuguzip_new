-- 권한 경계 유지
-- map_price_point_source 는 complex_geocode(지오코딩 캐시) 를 조인한다.
-- complex_geocode 는 anon 에게 RLS deny-all 이라, 지금까지 anon 이 이 뷰를 읽으면
-- 0행이 나왔다. 그런데 MV 에는 RLS 가 없고 기본 권한(anon/authenticated)이 자동으로
-- 붙어버리므로, 그대로 두면 anon 이 508개 단지 좌표를 통째로 읽게 된다.
-- => 지도 MV 는 service_role 전용으로 좁힌다. API 는 서비스 롤로 읽으므로 영향 없다.
revoke all on public.map_price_point_mv from anon, authenticated;
grant select on public.map_price_point_mv to service_role;

-- tx_band_* 는 국토부 공개 실거래 집계라 기존과 동일하게 공개 유지.
grant select on public.tx_band_landing_mv to anon, authenticated, service_role;
grant select on public.tx_band_complex_mv to anon, authenticated, service_role;

-- 뷰 본문만 MV 로 교체 (이름·컬럼·호출부 그대로)
create or replace view public.tx_band_landing_source
  with (security_invoker = on) as select * from public.tx_band_landing_mv;
create or replace view public.tx_band_complex_source
  with (security_invoker = on) as select * from public.tx_band_complex_mv;
create or replace view public.map_price_point_source
  with (security_invoker = on) as select * from public.map_price_point_mv;

-- 갱신 진입점
-- CONCURRENTLY: 갱신 중에도 읽기가 막히지 않는다(유니크 인덱스가 있어 가능).
-- SECURITY DEFINER: MV 소유자만 REFRESH 할 수 있으므로 service_role 이 직접
-- 호출할 수 있도록 postgres 권한으로 감싼다. search_path 를 고정해 하이재킹 방지.
-- (본문은 20260725013421 / 20260725014038 에서 갱신된다)
create or replace function public.refresh_market_aggregates()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
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
comment on function public.refresh_market_aggregates() is
  '실거래 집계 MV 3종을 CONCURRENTLY 재계산한다. MOLIT 인제스트 직후 호출. service_role 전용.';
