-- ============================================================
-- ETL market-agg 복구 (이슈 #141) — refresh_market_aggregates() 가
-- public.complex_household_v2 / complex_household_byname_v2 를 참조하는데,
-- 20260802000313(move_household_mvs_out_of_api_schema)이 두 MV 를
-- market_agg 스키마로 옮겨 42P01 로 전체 갱신이 실패했다.
-- 참조를 market_agg.* 로 맞춘다. 그 외 로직은 그대로.
-- (원격 적용 완료 2026-08-02, schema_migrations 20260802095822 —
--  적용 직후 수동 실행으로 정상 완주 확인)
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_market_aggregates()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'market_agg', 'public', 'pg_temp'
 SET statement_timeout TO '280s'
AS $function$
declare
  t0 timestamptz := clock_timestamp();
  result jsonb;
  sitemap_populated boolean;
  pair_populated boolean;
  tx_stats_populated boolean;
begin
  refresh materialized view concurrently market_agg.tx_band_landing_mv;
  refresh materialized view concurrently market_agg.tx_band_complex_mv;
  refresh materialized view concurrently market_agg.map_price_point_mv;

  select relispopulated into sitemap_populated
    from pg_class where oid = 'market_agg.complex_sitemap_mv'::regclass;
  if coalesce(sitemap_populated, false) then
    refresh materialized view concurrently market_agg.complex_sitemap_mv;
  else
    refresh materialized view market_agg.complex_sitemap_mv;
  end if;

  select relispopulated into pair_populated
    from pg_class where oid = 'market_agg.complex_pair_mv'::regclass;
  if coalesce(pair_populated, false) then
    refresh materialized view concurrently market_agg.complex_pair_mv;
  else
    refresh materialized view market_agg.complex_pair_mv;
  end if;

  /* 법정동코드 → 시군구 이름. 세대수를 "같은 지역의 같은 이름"으로 잇는 데 쓴다.
     실거래에서 끌어오되 최근 분만 읽는다 — 전체 스캔은 몇 분이 걸리고, 지역이
     새로 생기지 않는 이상 최근 몇 달이면 219개 코드가 모두 나온다. */
  insert into public.lawd_region_map (region_code, region_name)
  select region_code, min(region_name)
  from public.market_transactions
  where property_type = 'apartment'
    and region_code is not null and region_code <> ''
    and region_name is not null and region_name <> ''
    and contract_ym >= to_char(now() - interval '9 months', 'YYYYMM')
  group by region_code
  on conflict (region_code) do update set region_name = excluded.region_name;

  /* 2026-08-02: 두 MV 는 market_agg 로 이사했다 (API 스키마 노출 제거). */
  refresh materialized view concurrently market_agg.complex_household_v2;
  refresh materialized view concurrently market_agg.complex_household_byname_v2;

  select relispopulated into tx_stats_populated
    from pg_class where oid = 'public.complex_tx_stats_base'::regclass;
  if coalesce(tx_stats_populated, false) then
    refresh materialized view concurrently public.complex_tx_stats_base;
  else
    refresh materialized view public.complex_tx_stats_base;
  end if;

  select jsonb_build_object(
    'ok', true, 'refreshed_at', now(),
    'duration_ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int,
    'rows', jsonb_build_object(
      'tx_band_landing', (select count(*) from market_agg.tx_band_landing_mv),
      'tx_band_complex', (select count(*) from market_agg.tx_band_complex_mv),
      'map_price_point', (select count(*) from market_agg.map_price_point_mv),
      'complex_sitemap', (select count(*) from market_agg.complex_sitemap_mv),
      'complex_pair', (select count(*) from market_agg.complex_pair_mv),
      'lawd_region_map', (select count(*) from public.lawd_region_map),
      'household_by_region', (select count(*) from market_agg.complex_household_v2),
      'household_by_name', (select count(*) from market_agg.complex_household_byname_v2),
      'complex_tx_stats', (select count(*) from public.complex_tx_stats_base),
      'complex_with_households', (select count(*) from public.complex_tx_stats where households is not null))
  ) into result;
  return result;
end;
$function$;
