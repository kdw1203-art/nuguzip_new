-- F4 데이터 품질 검사 RPC — 관리자 화면(/admin/quality)이 쓰는 실측 집계.
--
-- 왜 RPC 인가: PostgREST 는 GROUP BY 를 못 한다. 중복 검사(같은 계약이 두 번 들어왔나)는
-- 본질적으로 GROUP BY … HAVING count(*)>1 이라 클라이언트에서 흉내 낼 수 없고,
-- 20여 개 null율/범위 검사를 각각 count 쿼리로 쪼개면 왕복이 20번이다. 한 번에 끝낸다.
--
-- 왜 판정이 여기 없는가: 임계값과 문구는 lib/admin/data-quality.ts 한 곳에만 둔다.
-- (lib/market/ingest-outcome.ts 가 F2/F3 의 단일 판정층인 것과 같은 구조.)
-- SQL 은 "몇 건인가"만 답하고, "그게 문제인가"는 TS 가 답한다.
--
-- 관리자 전용이라 anon/authenticated 에서 EXECUTE 를 회수한다.
-- (search_complexes 와 다른 점 — 그건 공개 검색이라 회수하지 않는다.)
--
-- 원격 DB 에 이미 적용된 마이그레이션의 사본이다(supabase/migrations/README.md 규약).
-- version 20260725064948 = supabase_migrations.schema_migrations 의 값과 정확히 일치.
--
-- 2026-07-25 06:49 UTC 최초 실행 실측 기준선(회귀 판단용):
--   market_transactions 70,222행 — null/범위/중복 검사 전 항목 0, 해제 402,
--     전세 표기 이원화 monthly_rent NULL 24,182 vs 0원 497,
--     월세행 평단가(보증금 기준) 22,674.
--   apartment_complexes 39,362행 — 단지 대장(k-apt-basic) 21,658, 별칭 등 17,704,
--     lawd_cd 빈 문자열 4,882, 이름 충돌 152군(같은 주소 0군), 주소 중복 224군.

create or replace function public.data_quality_report()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
with mt as (
  select
    count(*)::bigint as rows_total,
    count(*) filter (where complex_name is null or btrim(complex_name) = '')::bigint as complex_name_blank,
    count(*) filter (where address is null or btrim(address) = '')::bigint as address_blank,
    count(*) filter (where area_m2 is null)::bigint as area_null,
    count(*) filter (where floor is null)::bigint as floor_null,
    count(*) filter (where build_year is null)::bigint as build_year_null,
    count(*) filter (where contract_day is null)::bigint as contract_day_null,
    count(*) filter (where area_m2 is not null and (area_m2 <= 0 or area_m2 > 500))::bigint as area_out_of_range,
    count(*) filter (where floor is not null and (floor < -5 or floor > 100))::bigint as floor_out_of_range,
    count(*) filter (where build_year is not null
      and (build_year < 1950 or build_year > extract(year from (now() at time zone 'Asia/Seoul'))::int + 2))::bigint as build_year_out_of_range,
    count(*) filter (where contract_day is not null and (contract_day < 1 or contract_day > 31))::bigint as contract_day_out_of_range,
    count(*) filter (where contract_ym !~ '^[0-9]{6}$')::bigint as contract_ym_malformed,
    count(*) filter (where contract_ym ~ '^[0-9]{6}$'
      and contract_ym > to_char(now() at time zone 'Asia/Seoul', 'YYYYMM'))::bigint as contract_ym_future,
    count(*) filter (where region_code !~ '^[0-9]{5}$')::bigint as region_code_malformed,
    count(*) filter (where transaction_type = 'trade' and coalesce(deal_amount_krw, 0) <= 0)::bigint as trade_missing_amount,
    count(*) filter (where transaction_type = 'rent' and deposit_krw is null)::bigint as rent_missing_deposit,
    count(*) filter (where (transaction_type = 'trade' and (deposit_krw is not null or monthly_rent_krw is not null))
                        or (transaction_type = 'rent' and deal_amount_krw is not null))::bigint as type_field_bleed,
    count(*) filter (where transaction_type = 'rent' and monthly_rent_krw is null)::bigint as jeonse_as_null,
    count(*) filter (where transaction_type = 'rent' and monthly_rent_krw = 0)::bigint as jeonse_as_zero,
    count(*) filter (where transaction_type = 'rent' and coalesce(monthly_rent_krw, 0) > 0
      and coalesce(price_per_pyeong_krw, 0) > 0)::bigint as rent_ppp_from_deposit,
    count(*) filter (where is_cancelled)::bigint as cancelled
  from public.market_transactions
),
mtdup as (
  select count(*)::bigint as groups, coalesce(sum(c - 1), 0)::bigint as excess, coalesce(max(c), 0)::bigint as worst
  from (
    select count(*) as c
    from public.market_transactions
    group by region_code, complex_name, area_m2, floor, contract_ym, contract_day,
             transaction_type, coalesce(deal_amount_krw, deposit_krw), coalesce(monthly_rent_krw, 0)
    having count(*) > 1
  ) t
),
ac as (
  select
    count(*)::bigint as rows_total,
    count(*) filter (where source_key <> 'k-apt-basic')::bigint as non_master_rows,
    count(*) filter (where source_key = 'k-apt-basic')::bigint as master_rows,
    count(*) filter (where source_key = 'k-apt-basic' and (address is null or btrim(address) = ''))::bigint as master_address_blank,
    count(*) filter (where source_key = 'k-apt-basic' and (lawd_cd is null or btrim(lawd_cd) = ''))::bigint as master_lawd_blank,
    count(*) filter (where source_key = 'k-apt-basic' and coalesce(metadata->>'kaptCode', '') = '')::bigint as master_kapt_missing,
    count(*) filter (where source_key = 'k-apt-basic' and coalesce(metadata->>'sigungu', '') = '')::bigint as master_sigungu_blank
  from public.apartment_complexes
),
acname as (
  select count(*)::bigint as groups,
         coalesce(sum(c - 1), 0)::bigint as excess,
         coalesce(max(c), 0)::bigint as worst,
         count(*) filter (where addrs < c)::bigint as same_address_groups
  from (
    select count(*) as c, count(distinct address) as addrs
    from public.apartment_complexes
    where source_key = 'k-apt-basic'
    group by lawd_cd, regexp_replace(lower(btrim(name)), '[[:space:]]', '', 'g')
    having count(*) > 1
  ) t
),
acaddr as (
  select count(*)::bigint as groups, coalesce(sum(c - 1), 0)::bigint as excess
  from (
    select count(*) as c
    from public.apartment_complexes
    where source_key = 'k-apt-basic' and address is not null and btrim(address) <> ''
    group by address
    having count(*) > 1
  ) t
)
select jsonb_build_object(
  'generated_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'market_transactions', (select to_jsonb(mt) from mt)
    || jsonb_build_object('duplicate', (select to_jsonb(mtdup) from mtdup)),
  'apartment_complexes', (select to_jsonb(ac) from ac)
    || jsonb_build_object('name_collision', (select to_jsonb(acname) from acname),
                          'address_collision', (select to_jsonb(acaddr) from acaddr))
);
$$;

comment on function public.data_quality_report() is
  'F4 데이터 품질 검사 — market_transactions/apartment_complexes 실 null율·범위·중복 집계. 판정은 lib/admin/data-quality.ts.';

revoke all on function public.data_quality_report() from public;
revoke all on function public.data_quality_report() from anon;
revoke all on function public.data_quality_report() from authenticated;
grant execute on function public.data_quality_report() to service_role;
