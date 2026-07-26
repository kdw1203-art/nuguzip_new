-- 단지 사이트맵 소스를 머티리얼라이즈드 뷰로 내린다.
--
-- ── 무슨 일이 있었나 (실측) ────────────────────────────────────────────────
-- 운영의 https://nuguzip.com/sitemap-complexes.xml 이 503 을 내고 있었다.
-- 단지 페이지 24,851개 — 사이트맵에서 가장 크고 가장 값어치 있는 블록 — 이
-- 통째로 크롤러에 안 나가고 있었다는 뜻이다.
--
-- 원인은 public.complex_sitemap_source 가 매 요청마다 다시 도는 집계 뷰였다는 것.
-- 로더가 실제로 던지는 쿼리를 EXPLAIN (ANALYZE, TIMING OFF) 로 재 본 값:
--
--   Limit → Sort(top-N) → HashAggregate(Planned Partitions: 4) → Seq Scan
--   market_transactions 564,294행 스캔(필터 통과 204,046행)
--   Buffers: shared hit=12,906 read=50,901  (약 398MB 를 디스크에서 읽음)
--   Execution Time: 12,980.590 ms
--
-- PostgREST 로 들어오는 요청은 authenticator 롤로 접속한 뒤 SET ROLE 로 역할만
-- 바꾼다. 롤 단위 GUC 는 그때 다시 적용되지 않으므로, service_role 자신의
-- rolconfig 가 비어 있어도 authenticator 의 statement_timeout(8초)을 그대로
-- 물려받는다. 13초짜리 쿼리는 8초에서 취소된다.
--
-- 게다가 로더는 .range() 로 1,000행씩 25번 나눠 읽는다. 집계 뷰에 대고 페이지를
-- 넘기면 매 페이지가 20만 행 집계를 처음부터 다시 한다 — 사이트맵 한 번 만드는 데
-- 13초 × 25 = 5분 이상의 DB 작업을 요청하고, 전부 8초에서 잘린다.
--
-- ── 고치는 방법 ────────────────────────────────────────────────────────────
-- 이미 검증된 패턴을 그대로 쓴다(20260725013228 / 013320 / 014038).
-- 집계를 MV 로 미리 계산해 market_agg 스키마에 두고, 바깥에 보이는 이름·컬럼은
-- public.complex_sitemap_source 그대로 유지한다. 읽는 쪽 코드는 뷰만 보므로
-- 쿼리 형태가 바뀌지 않는다.
--
-- 원본은 국토부 확정 실거래이고 월 1회 인제스트로만 바뀐다. 요청 때마다 다시
-- 집계할 이유가 애초에 없었다.
--
-- ── 사실 우선 ──────────────────────────────────────────────────────────────
-- MV 는 못 읽은 값을 지어내지 않는다. 인제스트가 넣은 실거래를 다시 집계할 뿐이라
-- 사이트맵에 실리는 URL 은 항상 실제로 거래 이력이 있는 단지다. 갱신에 실패하면
-- 직전 집계가 남는다 — 오래될 수는 있어도 없는 단지가 생기지는 않는다.

-- ── 1) MV 생성 ─────────────────────────────────────────────────────────────
-- WITH NO DATA 로 만든다. 채우는 일은 갱신 함수(아래 3번)에 맡긴다.
-- 마이그레이션 트랜잭션을 13초 동안 붙잡고 있을 이유가 없고, 어차피 매일
-- 돌아야 하는 경로라 그 경로로 처음부터 채우는 편이 검증도 같이 된다.
create materialized view if not exists market_agg.complex_sitemap_mv as
  select region_name,
         complex_name,
         max(contract_ym) as last_contract_ym,
         max(created_at) as last_data_at,
         count(*)::integer as trade_count
    from public.market_transactions
   where transaction_type = 'trade'
     and is_cancelled = false
     and complex_name is not null
     and region_name is not null
   group by region_name, complex_name
  with no data;

comment on materialized view market_agg.complex_sitemap_mv is
  '단지 사이트맵(/complex/[id]) URL 목록. public.complex_sitemap_source 뷰로만 읽는다. refresh_market_aggregates() 가 갱신.';

-- REFRESH ... CONCURRENTLY 의 전제 조건. 이게 없으면 갱신 중 읽기가 막힌다.
create unique index if not exists complex_sitemap_mv_key
  on market_agg.complex_sitemap_mv (region_name, complex_name);

-- 로더의 ORDER BY 와 정확히 같은 순서 — trade_count DESC, region_name, complex_name.
-- 그래야 25번의 .range() 페이지 넘김이 정렬 없이 인덱스를 훑고 지나간다.
-- last_data_at 을 INCLUDE 해서 힙에 갔다 올 일도 없앤다(index-only scan).
create index if not exists complex_sitemap_mv_rank
  on market_agg.complex_sitemap_mv (trade_count desc, region_name, complex_name)
  include (last_data_at, last_contract_ym);

-- 읽는 주체는 사이트맵 로더 하나뿐이고 그것은 서버에서 service_role 로 돈다.
-- market_agg 스키마는 default privileges 로 anon·authenticated 를 이미 비워 두었으니
-- 그 의도대로 service_role 에만 준다.
grant select on market_agg.complex_sitemap_mv to service_role;

-- ── 2) public 뷰를 MV 로 갈아끼운다 (이름·컬럼·타입 동일) ──────────────────
-- 컬럼 구성이 같아야 create or replace 가 통과한다.
--   region_name text · complex_name text · last_contract_ym text
--   last_data_at timestamptz · trade_count integer
create or replace view public.complex_sitemap_source with (security_invoker = on) as
  select region_name, complex_name, last_contract_ym, last_data_at, trade_count
    from market_agg.complex_sitemap_mv;

comment on view public.complex_sitemap_source is
  '단지 사이트맵 소스. 2026-07-26 부터 market_agg.complex_sitemap_mv 를 읽는다(집계 뷰 시절 13초 → PostgREST 8초 타임아웃에 걸려 사이트맵이 비었다).';

-- security_invoker 뷰라 호출 롤의 권한으로 MV 를 읽는다. MV 를 service_role 에만
-- 열었으므로 뷰 권한도 같이 좁힌다. 이렇게 해 두어야 권한이 어긋났을 때
-- "빈 결과"가 아니라 명시적인 권한 오류로 드러난다.
revoke all on public.complex_sitemap_source from anon, authenticated;
grant select on public.complex_sitemap_source to service_role;

-- ── 3) 갱신 함수에 접어 넣는다 ─────────────────────────────────────────────
-- 새 크론을 만들지 않는다. 이 함수는 이미
--   app/api/cron/market-aggregates-refresh/route.ts (maxDuration 300초)
--   .github/workflows/etl.yml 의 market-agg 단계 (0 0 * * *, 0 9 * * *)
-- 로 매일 두 번 돌고 있다. 여기 한 줄 늘리는 것이 배선을 늘리지 않는 유일한 길이다.
--
-- 소요 예상: 기존 3개 8.75초 + 단지 집계 13초 ≈ 22초. 함수 수준
-- statement_timeout 280초, 크론 maxDuration 300초 안에서 끝난다.
create or replace function public.refresh_market_aggregates()
returns jsonb language plpgsql security definer
set search_path = market_agg, public, pg_temp
set statement_timeout = '280s'
as $$
declare
  t0 timestamptz := clock_timestamp();
  result jsonb;
  sitemap_populated boolean;
begin
  refresh materialized view concurrently market_agg.tx_band_landing_mv;
  refresh materialized view concurrently market_agg.tx_band_complex_mv;
  refresh materialized view concurrently market_agg.map_price_point_mv;

  -- 비어 있는 MV 에는 CONCURRENTLY 를 쓸 수 없다(Postgres 제약). 최초 1회만
  -- 일반 REFRESH 로 채우고 그 뒤로는 항상 CONCURRENTLY 다. 최초 1회는 읽기를
  -- 잠깐 막지만, 그 시점의 MV 는 어차피 비어 있어 막아서 잃을 것이 없다.
  select relispopulated into sitemap_populated
    from pg_class where oid = 'market_agg.complex_sitemap_mv'::regclass;

  if coalesce(sitemap_populated, false) then
    refresh materialized view concurrently market_agg.complex_sitemap_mv;
  else
    refresh materialized view market_agg.complex_sitemap_mv;
  end if;

  select jsonb_build_object(
    'ok', true, 'refreshed_at', now(),
    'duration_ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int,
    'rows', jsonb_build_object(
      'tx_band_landing', (select count(*) from market_agg.tx_band_landing_mv),
      'tx_band_complex', (select count(*) from market_agg.tx_band_complex_mv),
      'map_price_point', (select count(*) from market_agg.map_price_point_mv),
      'complex_sitemap', (select count(*) from market_agg.complex_sitemap_mv))
  ) into result;
  return result;
end;
$$;

revoke all on function public.refresh_market_aggregates() from public, anon, authenticated;
grant execute on function public.refresh_market_aggregates() to service_role;
