/*
 * complex_tx_stats 를 두 층으로 나눈다 — 실거래 집계(무거움) + 세대수 조회표(가벼움).
 * (2026-07-28, 적용 완료)
 *
 * ── 왜 나눴나 ──────────────────────────────────────────────────────────────
 * 세대수 규칙만 고치려는데 그럴 수가 없었다. 세대수가 complex_tx_stats 정의
 * 안에 들어 있어서, 규칙 한 줄을 바꾸려면 실거래 65만 건을 다시 접는 MV 를
 * 통째로 재생성해야 했다 — 실측 3분. 세션 연결 상한(60초)에 걸려 세 번 다
 * 롤백됐다. 자주 바뀌는 작은 규칙이 거의 안 바뀌는 무거운 집계에 묶여 있으면
 * 이런 일이 반복된다.
 *
 *   complex_tx_stats_base      실거래 집계 (기존 MV 이름만 바꿈, 정의 동일)
 *   complex_household_lookup   이름 → 세대수 (대장 19만 행만 읽음, 수 초)
 *   complex_tx_stats           위 둘을 잇는 **뷰** — 읽는 쪽은 이름 그대로 쓴다
 *
 * 읽는 쪽 네 함수(popular_complexes · map_complex_attrs · map_filter_facets ·
 * search_complexes_preview)는 한 줄도 고치지 않았다. 같은 이름의 뷰가 대신
 * 서기 때문이다.
 *
 * ── 세대수를 어디까지 믿는가 ────────────────────────────────────────────────
 * 조회표에 넣는 조건 네 가지. 근거는 마이그레이션 20260728120000 주석에 있다.
 *   1) detailStatus='ok' — 상세 조회가 실패한 행의 값은 세대수가 아니다
 *      (miss 569행 중앙값 4,840 · 최대 41,680 vs ok 19,315행 중앙값 437 · 최대 12,330).
 *   2) 1~20,000 — 국내 최대가 12,032세대(올림픽파크포레온)다. 그 위는 오류.
 *   3) 이름이 한 시군구에만 있는 경우만 — 같은 이름이 여러 곳에 있는 227건은
 *      전부 세대수가 다르다(최대 차이 19,558). 부산 삼화아파트 세대수를 서울
 *      삼화아파트에 붙이느니 비워 둔다. 모르는 건 모르는 채로 두는 게 낫다.
 *   4) 끝의 "아파트"를 뗀 이름으로 잇는다 — 대장은 "OO아파트", 실거래는 "OO"
 *      로 적는 경우가 많아 그냥 두면 이름의 23.7% 만 붙는다(34.9% 로 오른다).
 *
 * ── 효과 (실측) ────────────────────────────────────────────────────────────
 *   세대수를 아는 단지  4,019 → 7,623개
 *   표시되는 최댓값    31,440 → 12,032 (실제 최대 단지와 일치)
 *   지도 세대수 필터가 세는 단지 3,9xx → 7,527개
 *
 * ── 갱신 ───────────────────────────────────────────────────────────────────
 * refresh_market_aggregates() 가 complex_tx_stats 를 refresh 하고 있었는데
 * 이제 그 이름은 뷰라 refresh 대상이 아니다. 두 층을 각각 돌리도록 함께 고쳤다
 * (아래 CREATE OR REPLACE). 둘 다 유니크 인덱스가 있어 CONCURRENTLY 로 돈다.
 */

-- ── 1. 세대수 조회표 ────────────────────────────────────────────────────────
create materialized view if not exists public.complex_household_lookup as
select
  regexp_replace(replace(name, ' ', ''), '아파트$', '') as norm_name,
  max((metadata ->> 'householdCount')::integer) as households
from apartment_complexes
where source_key = 'k-apt-basic'
  and metadata ->> 'detailStatus' = 'ok'
  and (metadata ->> 'householdCount') ~ '^[0-9]+$'
  and (metadata ->> 'householdCount')::integer between 1 and 20000
group by regexp_replace(replace(name, ' ', ''), '아파트$', '')
having count(distinct lawd_cd) = 1;

create unique index if not exists complex_household_lookup_pk
  on public.complex_household_lookup (norm_name);

revoke all on public.complex_household_lookup from anon, authenticated;
grant select on public.complex_household_lookup to service_role, anon, authenticated;

-- ── 2. 기존 MV 이름 변경 + 같은 이름의 뷰로 두 층을 잇기 ────────────────────
-- (이미 적용된 환경에서 다시 돌 수 있게 조건부로 쓴다)
do $$
begin
  if to_regclass('public.complex_tx_stats_base') is null then
    execute 'alter materialized view public.complex_tx_stats rename to complex_tx_stats_base';
  end if;
end $$;

create or replace view public.complex_tx_stats as
select
  b.region_name, b.complex_name, b.address, b.trade_count, b.tx_count,
  b.recent_trade_count, b.avg_price_manwon, b.avg_area_m2, b.build_year,
  /* base 에 남아 있는 옛 households 컬럼은 여기서 가린다 — 조회표 값을 쓴다. */
  hl.households
from public.complex_tx_stats_base b
left join public.complex_household_lookup hl
  on hl.norm_name = regexp_replace(replace(b.complex_name, ' ', ''), '아파트$', '');

grant select on public.complex_tx_stats_base to service_role, anon, authenticated;
revoke all on public.complex_tx_stats from anon, authenticated;
grant select on public.complex_tx_stats to service_role, anon, authenticated;

-- ── 3. 갱신 함수 — 뷰가 아니라 두 층을 각각 돌린다 ──────────────────────────
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
  hh_populated boolean;
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

  select relispopulated into hh_populated
    from pg_class where oid = 'public.complex_household_lookup'::regclass;
  if coalesce(hh_populated, false) then
    refresh materialized view concurrently public.complex_household_lookup;
  else
    refresh materialized view public.complex_household_lookup;
  end if;

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
      'complex_household_lookup', (select count(*) from public.complex_household_lookup),
      'complex_tx_stats', (select count(*) from public.complex_tx_stats_base))
  ) into result;
  return result;
end;
$function$;
