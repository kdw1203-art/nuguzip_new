-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260805224554,
-- name = data_quality_report_snapshot.
-- 아래 본문은 그 원장의 statements 원문 그대로다. 내가 새로 쓴 문장은 이 머리말뿐이고
-- SQL 은 한 글자도 손대지 않았다. 이 파일이 적용 시점에 쓰였다는 뜻이 아니다.
--
-- 왜 비어 있었나: 이전 세션이 MCP apply_migration 으로 적용하고 파일 미러링을 빠뜨렸다.
-- 20260804234917 ~ 20260805225415 구간 11건을 2026-08-06 에 한꺼번에 복원했다.
-- 이 11건이 전부라는 뜻은 아니다. 같은 날 원장을 전수로 세어 본 결과는 이렇다 —
-- 기준선(20260724212021) 이후 원장 160행 대 파일 79개, 원장이 만들고 지금도 DB 에
-- 남아 있는 객체 238개 중 78개는 저장소 어디에도 정의가 없다. "11건" 은 눈에 띈
-- 최근 구간이었을 뿐이고, 센 결과가 아니었다.
-- 남은 결손은 supabase/ledger-snapshot.json 의 known_unmirrored 에 근거(원장 version)와
-- 함께 적어 두었고, scripts/check-migration-ledger.mjs 가 릴리스 게이트에서 다시 센다.
--
-- 이 파일만 읽고 판단하면 안 되는 것: 아래 capture_data_quality_snapshot() 의
-- duration_ms 계산식은 틀렸다(밀리초 성분과 초*1000 을 더해 초 미만이 두 번 세어진다).
-- 바로 다음 20260805224608 이 이를 바로잡는다. 원장 원문 보존이 이 파일의 목적이라
-- 여기서는 고치지 않는다.
--
-- 되돌리기:
--   drop function public.data_quality_report();          -- 직전 정의를 다시 적용해야 함
--   drop function public.capture_data_quality_snapshot();
--   drop function public.data_quality_report_live();
--   drop table public.data_quality_snapshot;

-- 문제: public.data_quality_report() 는 market_transactions(708k행/928MB) 전수 스캔 + 9컬럼 GROUP BY,
--       apartment_complexes 3회 스캔을 즉석에서 수행 → 60초 타임아웃으로 관리자 화면에서 사실상 사용 불가.
-- 해결: 계산은 야간 cron 으로 옮기고, 리포트 함수는 스냅샷을 읽기만 한다(page_view_summary 스냅샷화와 동일 패턴).
-- 반환 JSON 모양은 기존과 동일하게 유지하고, 신선도 표기(snapshot_at/stale)만 추가한다.

create table if not exists public.data_quality_snapshot (
  id          bigint generated always as identity primary key,
  computed_at timestamptz not null default now(),
  duration_ms integer,
  payload     jsonb not null
);
create index if not exists data_quality_snapshot_computed_at_idx
  on public.data_quality_snapshot (computed_at desc);

alter table public.data_quality_snapshot enable row level security;
revoke all on table public.data_quality_snapshot from public, anon, authenticated;

-- 기존 즉석 계산 로직을 _live 로 보존 (관리자가 강제 재계산할 때 사용)
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
$function$;

-- 스냅샷 생성기 (cron 전용)
create or replace function public.capture_data_quality_snapshot()
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t0 timestamptz := clock_timestamp();
  p  jsonb;
  newid bigint;
begin
  p := public.data_quality_report_live();
  insert into public.data_quality_snapshot (duration_ms, payload)
  values (extract(milliseconds from (clock_timestamp() - t0))::int
            + 1000 * extract(epoch from (clock_timestamp() - t0))::int / 1, p)
  returning id into newid;
  -- 스냅샷 30건만 보존
  delete from public.data_quality_snapshot
   where id not in (select id from public.data_quality_snapshot order by computed_at desc limit 30);
  return newid;
end;
$$;

-- 리포트 함수: 스냅샷을 읽기만 한다. 스냅샷이 없으면 즉석 계산으로 폴백(최초 1회).
create or replace function public.data_quality_report()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when s.payload is null then public.data_quality_report_live()
    else s.payload || jsonb_build_object(
      'snapshot_at', to_char(s.computed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'snapshot_age_hours', round(extract(epoch from (now() - s.computed_at))/3600.0, 1),
      'stale', (now() - s.computed_at) > interval '30 hours',
      'source', 'snapshot'
    )
  end
  from (select payload, computed_at from public.data_quality_snapshot order by computed_at desc limit 1) s
  right join (select 1) x on true;
$$;

revoke all on function public.data_quality_report_live() from public, anon, authenticated;
revoke all on function public.capture_data_quality_snapshot() from public, anon, authenticated;

comment on function public.data_quality_report() is
  '데이터 품질 리포트(스냅샷 읽기). 즉석 계산은 data_quality_report_live(). 2026-08-06: 60초 타임아웃 해소를 위해 스냅샷화.';
