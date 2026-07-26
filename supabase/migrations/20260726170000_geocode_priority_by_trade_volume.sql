-- 지오코딩 우선순위를 "거래량 많은 순"으로 되돌린다.
--
-- 경위: 원래 order by count(*) desc 였으나, market_transactions 가 커지면서 전체
-- 그룹을 다 집계해야 정렬이 끝나 statement timeout 이 났다. 급한 대로 가나다순
-- (order by region, complex)으로 바꿔 early-exit 시켰는데, 그 결과 거래 1건짜리
-- 단지와 수백 건짜리 인기 단지가 같은 우선순위가 됐다. 지도에서 체감되는 건
-- 거래 많은 단지인데도 알파벳 순서 운에 맡겨진 셈이다.
--
-- 해법: 단지별 거래 건수를 MV 로 미리 내려두고(3만 행), 함수는 그 작은 MV 만
-- 훑는다. 정렬 대상이 65만 행 → 3만 행으로 줄어 timeout 없이 거래량순 정렬이 된다.
-- 실측: complexes_needing_geocode(500) 이 524ms (예전 가나다순 550ms 와 동급인데
-- 정렬 기준은 제대로가 됐다).
--
-- 부수 효과(의도한 것): 예전 함수는 transaction_type='trade' 인 단지만 대상으로
-- 삼아, 전월세 거래만 있는 6,542개 단지는 영원히 좌표를 못 받고 지도에서 빠졌다.
-- MV 는 모든 거래 유형을 담되 매매 건수를 1순위 정렬키로 써서, 우선순위는 지키면서
-- 그 단지들도 결국 채워지게 한다.
--
-- 해제(취소)된 계약은 건수에서 뺀다 — 없던 일이 된 거래가 중요도를 부풀리면 안 된다.

create materialized view if not exists public.complex_tx_stats as
select
  mt.region_name,
  mt.complex_name,
  min(mt.address) filter (where mt.address is not null and mt.address <> '') as address,
  count(*) filter (
    where mt.transaction_type = 'trade' and coalesce(mt.is_cancelled, false) = false
  )::bigint as trade_count,
  count(*) filter (where coalesce(mt.is_cancelled, false) = false)::bigint as tx_count
from public.market_transactions mt
where mt.complex_name is not null and mt.complex_name <> ''
  and mt.region_name is not null and mt.region_name <> ''
group by mt.region_name, mt.complex_name;

-- REFRESH CONCURRENTLY 에 필수(유니크 인덱스가 없으면 갱신 중 읽기가 막힌다)
create unique index if not exists complex_tx_stats_pk
  on public.complex_tx_stats (region_name, complex_name);

-- 함수의 order by 를 그대로 태우는 인덱스
create index if not exists complex_tx_stats_priority_idx
  on public.complex_tx_stats (trade_count desc, tx_count desc);

-- 집계 MV 는 서비스 롤(크론)만 읽으면 된다. 익명/로그인 사용자에게 열지 않는다.
revoke all on public.complex_tx_stats from anon, authenticated;

create or replace function public.complexes_needing_geocode(p_limit integer default 200)
returns table(region_name text, complex_name text, address text, trade_count bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.region_name,
         s.complex_name,
         s.address,
         s.trade_count
  from public.complex_tx_stats s
  where not exists (
    select 1 from public.complex_geocode g
    where g.region_name = s.region_name
      and g.complex_name = s.complex_name
      -- notfound 는 7일 뒤 재시도(주소가 나중에 채워지는 경우가 있다)
      and (g.status <> 'notfound'
           or (g.geocoded_at is not null and g.geocoded_at >= now() - interval '7 days'))
  )
  order by s.trade_count desc, s.tx_count desc, s.region_name, s.complex_name
  limit greatest(1, least(1000, p_limit));
$function$;

revoke all on function public.complexes_needing_geocode(integer) from anon, authenticated;

-- ── complex_tx_stats 를 기존 집계 갱신 대열에 합류 ──────────────────────────
-- 새 크론을 만들지 않는 이유: 이 함수가 이미 etl.yml 의 market-agg 단계로 하루 두 번
-- 돌고, molit 적재 직후에도 호출된다. 스케줄러는 하나로 유지한다.
-- 이 연결이 빠지면 새로 적재된 단지가 지오코딩 대상에 영원히 안 잡혀
-- "실거래는 있는데 지도에 안 뜨는 단지"가 계속 쌓인다.

create or replace function public.refresh_market_aggregates()
returns jsonb
language plpgsql
security definer
set search_path to 'market_agg', 'public', 'pg_temp'
set statement_timeout to '280s'
as $function$
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

  select relispopulated into tx_stats_populated
    from pg_class where oid = 'public.complex_tx_stats'::regclass;

  if coalesce(tx_stats_populated, false) then
    refresh materialized view concurrently public.complex_tx_stats;
  else
    refresh materialized view public.complex_tx_stats;
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
      'complex_tx_stats', (select count(*) from public.complex_tx_stats))
  ) into result;
  return result;
end;
$function$;
