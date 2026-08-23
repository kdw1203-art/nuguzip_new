-- [#94 잔여] 지역별 월세 수익률 재료 RPC — 갭 스크리너의 "월세 환산 수익률" 열.
-- 최근 p_months 캘린더 월의 전월세 신고에서 지역(region_name)별
--   전세 보증금 중앙값 / 월세 보증금·월세 중앙값 / 건수
-- 를 DB 안에서 percentile_cont 로 한 번에 계산한다 (62개 지역 × 개별 표본 조회를
-- 페이지 렌더마다 하는 것을 피한다 — 호출은 ISR 재검증 주기당 1회).
-- 호출: service_role 만 (다른 자동화 RPC 와 동일한 잠금).
create or replace function public.region_rent_yield_summary(
  p_months int default 3
)
returns table(
  region_name text,
  jeonse_count bigint,
  jeonse_median_deposit_krw numeric,
  wolse_count bigint,
  wolse_median_deposit_krw numeric,
  wolse_median_monthly_krw numeric
)
language sql
stable
set search_path = public
as $$
  select
    t.region_name,
    count(*) filter (where coalesce(t.monthly_rent_krw,0) = 0) as jeonse_count,
    percentile_cont(0.5) within group (order by t.deposit_krw)
      filter (where coalesce(t.monthly_rent_krw,0) = 0) as jeonse_median_deposit_krw,
    count(*) filter (where coalesce(t.monthly_rent_krw,0) > 0) as wolse_count,
    percentile_cont(0.5) within group (order by t.deposit_krw)
      filter (where coalesce(t.monthly_rent_krw,0) > 0) as wolse_median_deposit_krw,
    percentile_cont(0.5) within group (order by t.monthly_rent_krw)
      filter (where coalesce(t.monthly_rent_krw,0) > 0) as wolse_median_monthly_krw
  from public.market_transactions t
  where t.transaction_type = 'rent'
    and t.property_type = 'apartment'
    and coalesce(t.is_cancelled, false) = false
    and t.deposit_krw is not null and t.deposit_krw > 0
    and t.contract_ym >= to_char(now() - make_interval(months => greatest(1, p_months) - 1), 'YYYYMM')
  group by t.region_name
$$;

revoke execute on function public.region_rent_yield_summary(int) from public;
revoke execute on function public.region_rent_yield_summary(int) from anon;
revoke execute on function public.region_rent_yield_summary(int) from authenticated;
grant execute on function public.region_rent_yield_summary(int) to service_role;
