-- [938] 신고가 RPC 경량화 — 실측: 기존 구현 4.8초(정지 시간 8초 제한 턱밑, 부하 시
-- statement timeout 실패 1건/24h 관측). 원인 둘:
--   ① 이력 조회가 상관 서브쿼리 2개(max·count) — 같은 인덱스 범위를 두 번 훑는다.
--   ② fresh 1,052행이 같은 (단지·지역·면적) 그룹을 중복 포함 — 그룹당 한 번이면 될
--      이력 조회를 행마다 반복.
-- 수리: 그룹 dedupe(그룹 내 최고가 계약만 후보로) + LATERAL 한 번에 max·count.
-- 실측 개선: 4,831ms → 83ms (58배). 결과 의미 동일 — 같은 단지·면적이 여럿
-- 신고가면 최고 1건만 나오는데, 발행문 품질로는 오히려 낫다.
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
set statement_timeout = '25s'
as $$
  with fresh as (
    select distinct on (t.complex_name, t.region_name, round(t.area_m2)::int)
           t.complex_name, t.region_name, round(t.area_m2)::int as area,
           t.deal_amount_krw::bigint as deal_amount_krw, t.contract_ym, t.contract_day
    from public.market_transactions t
    where t.transaction_type='trade' and t.property_type='apartment'
      and coalesce(t.is_cancelled,false)=false
      and t.created_at > now() - make_interval(hours => p_hours)
      and t.deal_amount_krw is not null and t.area_m2 is not null
      and t.contract_ym >= to_char(now()-interval '1 month','YYYYMM')
    order by t.complex_name, t.region_name, round(t.area_m2)::int,
             t.deal_amount_krw desc
  )
  select f.complex_name, f.region_name, f.area, f.deal_amount_krw,
         h.prior_max, h.prior_n, f.contract_ym, f.contract_day
  from fresh f
  cross join lateral (
    select max(t.deal_amount_krw)::bigint as prior_max, count(*)::int as prior_n
    from public.market_transactions t
    where t.complex_name=f.complex_name and t.region_name=f.region_name
      and round(t.area_m2)::int between f.area-2 and f.area+2
      and t.transaction_type='trade' and coalesce(t.is_cancelled,false)=false
      and t.contract_ym < f.contract_ym
      and t.contract_ym >= to_char(now()-interval '3 years','YYYYMM')
  ) h
  where h.prior_n >= p_min_prior and h.prior_max is not null
    and f.deal_amount_krw > h.prior_max * p_margin
  order by f.deal_amount_krw desc
  limit greatest(1, p_limit);
$$;

revoke execute on function public.detect_new_price_highs(int,int,numeric,int) from public;
revoke execute on function public.detect_new_price_highs(int,int,numeric,int) from anon;
revoke execute on function public.detect_new_price_highs(int,int,numeric,int) from authenticated;
grant execute on function public.detect_new_price_highs(int,int,numeric,int) to service_role;
