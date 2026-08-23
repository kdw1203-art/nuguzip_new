-- [3차 Wave 8] 공용 인프라 4건
-- ① #105 내부검색 제로결과 로그 — "수요가 공급을 주문"하는 루프의 원천
create table if not exists public.search_zero_results (
  id bigint generated always as identity primary key,
  query text not null,
  searched_at timestamptz not null default now()
);
create index if not exists search_zero_results_at_idx on public.search_zero_results (searched_at);
alter table public.search_zero_results enable row level security; -- 정책 없음 = service 전용

-- ② #107 위젯 임베드 추적 — 어느 블로그가 심었나 (document.referrer 비콘, host 단위 일집계)
create table if not exists public.widget_embed_hits (
  host text not null,
  day date not null,
  kind text not null default 'complex',        -- complex | region
  hits int not null default 0,
  sample_url text,
  primary key (host, day, kind)
);
alter table public.widget_embed_hits enable row level security;

-- ③ #129 노트 전문 검색 — trigram (검색 API 는 title/summary/메모를 ilike + similarity)
create extension if not exists pg_trgm;
create index if not exists inspection_notes_title_trgm on public.inspection_notes using gin (title gin_trgm_ops);
create index if not exists inspection_notes_summary_trgm on public.inspection_notes using gin (coalesce(summary,'') gin_trgm_ops);

-- ④ #135 전월세 갱신·신규 추정 — 지역 단위 갱신 추정 비율 RPC.
-- 휴리스틱: 같은 (region, complex, 반올림 면적)에서 22~26개월 전 보증금의 ±15% 이내
-- 신규 계약이 있으면 "갱신 추정". 개별 계약 단정이 아니라 **지역 비율 통계**로만 쓴다
-- (화면에 추정·한계 명기). service_role 전용.
create or replace function public.region_rent_renewal_estimate(
  p_months int default 3
)
returns table(
  region_name text,
  total bigint,
  renewal_est bigint
)
language sql
stable
set search_path = public
as $$
  with recent as (
    select region_name, complex_name, round(area_m2)::int as area, deposit_krw, contract_ym
    from market_transactions
    where transaction_type='rent' and property_type='apartment'
      and coalesce(is_cancelled,false)=false and deposit_krw > 0
      and contract_ym >= to_char(now() - make_interval(months => greatest(1,p_months)-1),'YYYYMM')
  )
  select r.region_name,
         count(*)::bigint as total,
         count(*) filter (where exists (
           select 1 from market_transactions p
           where p.transaction_type='rent' and p.property_type='apartment'
             and coalesce(p.is_cancelled,false)=false
             and p.region_name = r.region_name and p.complex_name = r.complex_name
             and round(p.area_m2)::int between r.area-1 and r.area+1
             and p.contract_ym between to_char(to_date(r.contract_ym,'YYYYMM') - interval '26 months','YYYYMM')
                                   and to_char(to_date(r.contract_ym,'YYYYMM') - interval '22 months','YYYYMM')
             and p.deposit_krw between (r.deposit_krw*0.85)::bigint and (r.deposit_krw*1.15)::bigint
         ))::bigint as renewal_est
  from recent r
  group by r.region_name
$$;
revoke execute on function public.region_rent_renewal_estimate(int) from public;
revoke execute on function public.region_rent_renewal_estimate(int) from anon;
revoke execute on function public.region_rent_renewal_estimate(int) from authenticated;
grant execute on function public.region_rent_renewal_estimate(int) to service_role;
