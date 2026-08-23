-- [#81] 신고가 탐지 RPC — 최근 유입 실거래 중 "당월·전월 계약 + 사전 이력 10건 이상 +
-- 직전 3년 최고가를 3% 이상 경신"만 추린다. 백필 유입(created_at 만 최신인 과거 계약)이
-- 가짜 신고가의 주범이라 contract_ym 하한이 핵심 필터다.
-- 호출: 크론(service_role)만 — 나머지 롤은 실행 불가.
create or replace function public.detect_new_price_highs(
  p_hours int default 26,
  p_min_prior int default 10,
  p_margin numeric default 1.03,
  p_limit int default 5
)
returns table(
  complex_name text,
  region_name text,
  area int,
  deal_amount_krw bigint,
  prior_max bigint,
  prior_n int,
  contract_ym text,
  contract_day int
)
language sql
stable
set search_path = public
as $$
  with fresh as (
    select t.complex_name, t.region_name, round(t.area_m2)::int as area,
           t.deal_amount_krw::bigint as deal_amount_krw, t.contract_ym, t.contract_day
    from public.market_transactions t
    where t.transaction_type='trade' and t.property_type='apartment'
      and coalesce(t.is_cancelled,false)=false
      and t.created_at > now() - make_interval(hours => p_hours)
      and t.deal_amount_krw is not null and t.area_m2 is not null
      and t.contract_ym >= to_char(now()-interval '1 month','YYYYMM')
  ), hist as (
    select f.*,
      (select max(t.deal_amount_krw)::bigint from public.market_transactions t
        where t.complex_name=f.complex_name and t.region_name=f.region_name
          and round(t.area_m2)::int between f.area-2 and f.area+2
          and t.transaction_type='trade' and coalesce(t.is_cancelled,false)=false
          and t.contract_ym < f.contract_ym
          and t.contract_ym >= to_char(now()-interval '3 years','YYYYMM')
      ) as prior_max,
      (select count(*)::int from public.market_transactions t
        where t.complex_name=f.complex_name and t.region_name=f.region_name
          and round(t.area_m2)::int between f.area-2 and f.area+2
          and t.transaction_type='trade' and coalesce(t.is_cancelled,false)=false
          and t.contract_ym < f.contract_ym
          and t.contract_ym >= to_char(now()-interval '3 years','YYYYMM')
      ) as prior_n
    from fresh f
  )
  select h.complex_name, h.region_name, h.area, h.deal_amount_krw,
         h.prior_max, h.prior_n, h.contract_ym, h.contract_day
  from hist h
  where h.prior_n >= p_min_prior and h.prior_max is not null
    and h.deal_amount_krw > h.prior_max * p_margin
  order by h.deal_amount_krw desc
  limit greatest(1, p_limit);
$$;

revoke execute on function public.detect_new_price_highs(int,int,numeric,int) from public;
revoke execute on function public.detect_new_price_highs(int,int,numeric,int) from anon;
revoke execute on function public.detect_new_price_highs(int,int,numeric,int) from authenticated;
grant execute on function public.detect_new_price_highs(int,int,numeric,int) to service_role;
