/*
 * 세대수 매칭을 지역까지 맞춰 잇고, 이름 정규화를 실제 표기 차이에 맞춘다.
 * (2026-08-01, 원격 적용 완료)
 *
 * ── 무엇이 부족했나 ────────────────────────────────────────────────────────
 * 실거래 집계 32,133개 단지 중 세대수를 아는 건 7,999개(24.9%)뿐이었다.
 * 세대수는 지도 단지 패널·단지 홈에 표시되고 "세대수 규모" 슬라이더의 판정에도
 * 쓰이므로, 네 단지 중 세 곳이 그 필터에서 아예 빠져 있었다는 뜻이다.
 *
 * 원인은 두 가지였다.
 *
 * 1) 이름이 전국에서 유일할 때만 이었다.
 *    같은 이름이 여러 시군구에 있으면(부산 삼화 / 서울 삼화) 어느 쪽 값인지
 *    알 수 없어 통째로 버렸다. 옳은 판단이었지만, 지역을 함께 맞추면 버릴 이유가
 *    없다. 실거래(market_transactions.region_code)와 대장(apartment_complexes.
 *    lawd_cd)이 같은 5자리 법정동코드를 쓴다 — 219개 코드가 region_name 과
 *    1:1 로 대응하는 것을 확인했다(모호한 코드 0건).
 *
 * 2) 정규화가 공백과 끝의 "아파트"만 다뤘다.
 *    실측한 미매칭 상위 단지들이 전부 표기 차이였다:
 *      상계주공9(고층)      ↔ 상계주공9        (끝 괄호 설명)
 *      황골마을주공1        ↔ 황골마을주공1단지 (끝 "단지")
 *      다산 이편한세상자이  ↔ 다산e편한세상자이 (이편한세상 = e편한세상)
 *      에스케이북한산시티   ↔ SK북한산시티      (한글 음차 = 영문 약자)
 *
 * ── 어떻게 고쳤나 ──────────────────────────────────────────────────────────
 *   lawd_region_map            법정동코드 → 시군구 이름 (219행)
 *   nz_norm_complex_name()     소문자화 · 공백 제거 · 음차 통일 · 끝 괄호/단지/아파트 제거
 *   complex_household_v2       (지역, 정규화이름) → 세대수   — 정확한 쪽
 *   complex_household_byname_v2 (정규화이름) → 세대수        — 대장에 lawd_cd 가
 *                              없는 단지까지 덮는 보완
 *   complex_tx_stats           coalesce(지역매칭, 이름매칭)
 *
 * 두 조회표 모두 같은 키에 **서로 다른** 세대수가 붙으면 그 키를 버린다
 * (having count(distinct households) = 1). 괄호를 떼면 "상계주공9(고층)"과
 * "상계주공9(저층)"이 한 키가 되는데, 둘은 세대수가 다른 별개 단지다. 합쳐서
 * 아무 값이나 고르느니 비워 두는 편이 낫다 — 모르는 건 모르는 채로 둔다.
 *
 * ── 효과 (실측) ────────────────────────────────────────────────────────────
 *   세대수를 아는 단지   7,999 → 8,948개 (+949, +11.9%)
 *   두 조회표가 겹치는 곳에서 값이 어긋난 경우 0건 (교차 검증)
 *   중앙값 416세대 · 최댓값 12,032(올림픽파크포레온) · 6,000 초과 4곳 — 모두 실재
 *
 * ── 곁들여 정리한 것 ───────────────────────────────────────────────────────
 * 새 조회표는 anon/authenticated 에게 노출하지 않는다. 화면이 읽는 것은
 * complex_tx_stats 뷰 하나이고, 이 뷰는 security definer 라 하위 MV 권한이
 * 필요 없다 — anon 으로 실제 조회해 8,948행이 그대로 나오는 것을 확인했다.
 * (Supabase 보안 린트의 materialized_view_in_api 경고 2건이 함께 사라진다.)
 *
 * refresh_market_aggregates() 도 새 조회표를 돌리도록 고쳤다. lawd_region_map 은
 * 최근 9개월 실거래만 읽어 채운다 — 전체 스캔은 몇 분이 걸리는데, 시군구가 새로
 * 생기지 않는 이상 최근 몇 달이면 219개 코드가 모두 나온다.
 */

-- ── 1. 법정동코드 → 시군구 이름 ─────────────────────────────────────────────
create table if not exists public.lawd_region_map (
  region_code text primary key,
  region_name text not null
);
revoke all on public.lawd_region_map from anon, authenticated;
grant select on public.lawd_region_map to service_role;

insert into public.lawd_region_map (region_code, region_name)
select region_code, min(region_name)
from public.market_transactions
where property_type = 'apartment'
  and region_code is not null and region_code <> ''
  and region_name is not null and region_name <> ''
  and contract_ym >= to_char(now() - interval '9 months', 'YYYYMM')
group by region_code
on conflict (region_code) do update set region_name = excluded.region_name;

-- ── 2. 단지명 정규화 ────────────────────────────────────────────────────────
create or replace function public.nz_norm_complex_name(v text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          replace(replace(replace(replace(replace(replace(
            lower(coalesce(v, '')),
            ' ', ''),
            '이편한세상', 'e편한세상'),
            'e-편한세상', 'e편한세상'),
            '에스케이', 'sk'),
            '지에스', 'gs'),
            '엘지', 'lg'),
          '\([^)]*\)$', ''),
        '단지$', ''),
      '아파트$', ''),
    '')
$$;

-- ── 3. 조회표 두 층 ─────────────────────────────────────────────────────────
create materialized view if not exists public.complex_household_v2 as
select m.region_name,
       public.nz_norm_complex_name(ac.name) as norm_name,
       max((ac.metadata->>'householdCount')::int) as households
from public.apartment_complexes ac
join public.lawd_region_map m on m.region_code = ac.lawd_cd
where ac.source_key = 'k-apt-basic'
  and ac.metadata->>'detailStatus' = 'ok'
  and (ac.metadata->>'householdCount') ~ '^[0-9]+$'
  and (ac.metadata->>'householdCount')::int between 1 and 20000
  and public.nz_norm_complex_name(ac.name) is not null
group by 1, 2
having count(distinct (ac.metadata->>'householdCount')::int) = 1;

create unique index if not exists complex_household_v2_pk
  on public.complex_household_v2 (region_name, norm_name);

create materialized view if not exists public.complex_household_byname_v2 as
select public.nz_norm_complex_name(name) as norm_name,
       max((metadata->>'householdCount')::int) as households
from public.apartment_complexes
where source_key = 'k-apt-basic'
  and metadata->>'detailStatus' = 'ok'
  and (metadata->>'householdCount') ~ '^[0-9]+$'
  and (metadata->>'householdCount')::int between 1 and 20000
  and public.nz_norm_complex_name(name) is not null
group by 1
having count(distinct (metadata->>'householdCount')::int) = 1;

create unique index if not exists complex_household_byname_v2_pk
  on public.complex_household_byname_v2 (norm_name);

-- 화면이 읽는 것은 complex_tx_stats 뿐이다. 하위 조회표는 API 로 열지 않는다.
revoke all on public.complex_household_v2 from anon, authenticated;
revoke all on public.complex_household_byname_v2 from anon, authenticated;
grant select on public.complex_household_v2 to service_role;
grant select on public.complex_household_byname_v2 to service_role;

-- ── 4. 읽는 쪽 이름은 그대로 — 뷰만 갈아 끼운다 ─────────────────────────────
create or replace view public.complex_tx_stats as
select
  b.region_name, b.complex_name, b.address, b.trade_count, b.tx_count,
  b.recent_trade_count, b.avg_price_manwon, b.avg_area_m2, b.build_year,
  coalesce(v2.households, bn.households) as households
from public.complex_tx_stats_base b
left join public.complex_household_v2 v2
  on v2.region_name = b.region_name
 and v2.norm_name = public.nz_norm_complex_name(b.complex_name)
left join public.complex_household_byname_v2 bn
  on bn.norm_name = public.nz_norm_complex_name(b.complex_name);

revoke all on public.complex_tx_stats from anon, authenticated;
grant select on public.complex_tx_stats to service_role, anon, authenticated;

drop materialized view if exists public.complex_household_lookup;

-- ── 5. 갱신 함수 ────────────────────────────────────────────────────────────
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

  insert into public.lawd_region_map (region_code, region_name)
  select region_code, min(region_name)
  from public.market_transactions
  where property_type = 'apartment'
    and region_code is not null and region_code <> ''
    and region_name is not null and region_name <> ''
    and contract_ym >= to_char(now() - interval '9 months', 'YYYYMM')
  group by region_code
  on conflict (region_code) do update set region_name = excluded.region_name;

  refresh materialized view concurrently public.complex_household_v2;
  refresh materialized view concurrently public.complex_household_byname_v2;

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
      'household_by_region', (select count(*) from public.complex_household_v2),
      'household_by_name', (select count(*) from public.complex_household_byname_v2),
      'complex_tx_stats', (select count(*) from public.complex_tx_stats_base),
      'complex_with_households', (select count(*) from public.complex_tx_stats where households is not null))
  ) into result;
  return result;
end;
$function$;
