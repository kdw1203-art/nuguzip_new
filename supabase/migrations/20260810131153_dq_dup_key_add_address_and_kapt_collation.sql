-- 데이터 품질 검사기 자체의 오탐 2건을 고친다 (데이터가 아니라 검사기가 틀렸던 경우).
--
-- (1) 동일 계약 중복 검사의 그룹 키에 address 를 추가한다.
--     2026-08-10 실측: 유일한 "중복 1군"은 중복이 아니었다 — 시흥 장곡동에
--     이름이 같은 "숲속마을" 단지가 둘 있고(장곡동 806 aptSeq 41390-120 vs
--     807 aptSeq 41390-2490, 도로명도 다름), 같은 날·같은 층·같은 면적·같은
--     보증금/월세의 별개 계약이 우연히 겹쳤다. 키에 주소가 없어 한 계약처럼
--     보였을 뿐이다. 같은 계약이 두 번 들어온 진짜 중복은 주소도 같으므로
--     (동일 원천 raw), address 를 키에 넣어도 진짜 중복은 계속 잡힌다.
--     생존 증명(2026-08-10): 실존 행 1개를 자기 자신과 union all 해 새 키로
--     묶으면 count=2 로 잡힌다. 고쳐 놓고 0건만 보고 끝내지 않았다.
--
-- (2) 같은 구·같은 이름·같은 주소 단지 군에 kaptCode 대조를 내장한다.
--     기존 same_address_groups 는 "주소까지 같은 군 8군 — kaptCode 로 대조해야
--     한다"고 사람에게 숙제를 남겼다. 2026-08-10 전수 대조 결과 8군 모두
--     kaptCode 가 서로 다른 별개 단지였다(주소가 동 단위로 뭉뚱그려져 겹침).
--     이제 same_address_kapt_dup_groups 가 "주소도 같고 kaptCode 도 겹치는 군"
--     (= 진짜 중복 적재 의심)을 기계가 직접 센다. 판정 문구는
--     lib/admin/data-quality.ts 가 이 값으로 갈린다.
--     곁가지 발견(별건): 8군 중 3군은 K-apt 원천의 테스트 행이다
--     ("테스트" 대구 각산동, "test" 고양 오금동, "한국감정원" 대구 각산동).
--
-- 적용: 2026-08-10 13:11 UTC, MCP apply_migration (원격 선적용 → 이 파일은 미러).
--
-- 되돌리기: 직전 정의(20260805224554 의 data_quality_report_live)를 다시 적용.
create or replace function public.data_quality_report_live()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
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
    group by region_code, complex_name, address, area_m2, floor, contract_ym, contract_day,
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
         count(*) filter (where addrs < c)::bigint as same_address_groups,
         count(*) filter (where addrs < c and kapts < c)::bigint as same_address_kapt_dup_groups
  from (
    select count(*) as c,
           count(distinct address) as addrs,
           count(distinct coalesce(metadata->>'kaptCode', '')) as kapts
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
$function$;

comment on function public.data_quality_report_live() is
  'F4 데이터 품질 즉석 계산 — 중복 키에 address 포함(동명 단지 오탐 방지), 동명·동주소 군 kaptCode 대조 내장. 판정은 lib/admin/data-quality.ts.';
