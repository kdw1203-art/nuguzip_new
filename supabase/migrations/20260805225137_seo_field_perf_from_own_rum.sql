-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260805225137,
-- name = seo_field_perf_from_own_rum.
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
-- 되돌리기: drop function public.capture_seo_field_perf_rum(integer);
--           그리고 delete from public.seo_field_perf where target = 'self:rum';
--           (함수만 지우면 이미 적재된 self:rum 행은 남는다.)

-- 문제: public.seo_field_perf 는 CrUX 연동(API 키) 대기로 0행 상태 → SEO/성능 대시보드가 비어 있음.
-- 해결: 이미 수집 중인 자체 RUM(public.web_vitals)으로 주간 p75/good% 를 채운다.
--       CrUX 가 붙으면 target 값으로 구분되어 공존한다(자체=self:rum, CrUX=https://nuguzip.com).
-- PK (collected_week, target, form_factor) 그대로 사용 → 멱등 upsert.

create or replace function public.capture_seo_field_perf_rum(p_weeks integer default 12)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  with base as (
    select
      (date_trunc('week', (created_at at time zone 'Asia/Seoul')))::date as wk,
      case
        when user_agent ~* '(Mobile|Android|iPhone|iPad|iPod|Windows Phone)' then 'PHONE'
        else 'DESKTOP'
      end as ff,
      metric, value, rating,
      (created_at at time zone 'Asia/Seoul')::date as d
    from public.web_vitals
    where created_at >= (date_trunc('week', (now() at time zone 'Asia/Seoul')) - (p_weeks || ' weeks')::interval)
      and metric in ('LCP','INP','FCP','TTFB','CLS')
  ),
  expanded as (
    select wk, ff, metric, value, rating, d from base
    union all
    select wk, 'ALL', metric, value, rating, d from base
  ),
  agg as (
    select
      wk, ff,
      round(percentile_cont(0.75) within group (order by value) filter (where metric='LCP'))::int  as lcp_p75,
      round(percentile_cont(0.75) within group (order by value) filter (where metric='INP'))::int  as inp_p75,
      round(percentile_cont(0.75) within group (order by value) filter (where metric='FCP'))::int  as fcp_p75,
      round(percentile_cont(0.75) within group (order by value) filter (where metric='TTFB'))::int as ttfb_p75,
      round((percentile_cont(0.75) within group (order by value) filter (where metric='CLS'))::numeric, 3) as cls_p75,
      count(*) filter (where metric='LCP') as lcp_n,
      count(*) filter (where metric='INP') as inp_n,
      count(*) filter (where metric='CLS') as cls_n,
      round(100.0 * count(*) filter (where metric='LCP' and rating='good')
            / nullif(count(*) filter (where metric='LCP'),0), 1) as lcp_good,
      round(100.0 * count(*) filter (where metric='INP' and rating='good')
            / nullif(count(*) filter (where metric='INP'),0), 1) as inp_good,
      round(100.0 * count(*) filter (where metric='CLS' and rating='good')
            / nullif(count(*) filter (where metric='CLS'),0), 1) as cls_good,
      min(d) as first_d, max(d) as last_d
    from expanded
    group by wk, ff
  )
  insert into public.seo_field_perf (
    collected_week, target, form_factor, status, error_detail,
    lcp_p75_ms, inp_p75_ms, fcp_p75_ms, ttfb_p75_ms, cls_p75,
    lcp_good_pct, inp_good_pct, cls_good_pct,
    period_first_date, period_last_date, observed_at
  )
  select
    a.wk, 'self:rum', a.ff,
    case when a.lcp_n >= 30 then 'ok' else 'insufficient_data' end,
    format('자체 RUM 표본 LCP=%s INP=%s CLS=%s', a.lcp_n, a.inp_n, a.cls_n),
    a.lcp_p75, a.inp_p75, a.fcp_p75, a.ttfb_p75, a.cls_p75,
    a.lcp_good, a.inp_good, a.cls_good,
    a.first_d, a.last_d, now()
  from agg a
  on conflict (collected_week, target, form_factor) do update set
    status            = excluded.status,
    error_detail      = excluded.error_detail,
    lcp_p75_ms        = excluded.lcp_p75_ms,
    inp_p75_ms        = excluded.inp_p75_ms,
    fcp_p75_ms        = excluded.fcp_p75_ms,
    ttfb_p75_ms       = excluded.ttfb_p75_ms,
    cls_p75           = excluded.cls_p75,
    lcp_good_pct      = excluded.lcp_good_pct,
    inp_good_pct      = excluded.inp_good_pct,
    cls_good_pct      = excluded.cls_good_pct,
    period_first_date = excluded.period_first_date,
    period_last_date  = excluded.period_last_date,
    observed_at       = excluded.observed_at;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.capture_seo_field_perf_rum(integer) from public, anon, authenticated;
comment on function public.capture_seo_field_perf_rum(integer) is
  '자체 RUM(web_vitals)으로 seo_field_perf 주간 지표를 채운다. target=self:rum. CrUX 연동 시 target 로 공존. 2026-08-06 신설.';
