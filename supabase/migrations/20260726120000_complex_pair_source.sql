-- N10 — "단지 A vs 단지 B" 비교 랜딩의 **화이트리스트**.
--
-- ── 무엇을 만드나 ──────────────────────────────────────────────────────────
-- "래미안○○ vs 힐스테이트○○" 는 실제로 많이 검색되는 형태다. 그런데 이런 페이지는
-- 자동 생성으로 순식간에 수만 장이 된다 — 그리고 그 대부분은 근거가 될 거래가 없다.
-- 기획 문서가 못 박아 둔 경계가 그것이다:
--   "거래가 얇은 조합의 비교 페이지 양산(N10 기준 미달 시 생성 금지)"
--
-- 그 금지를 사람의 약속이 아니라 **기계가 강제하는 규칙**으로 만든다. 이 MV 에
-- 없는 조합은 페이지가 아예 404 다. 코드가 조합을 만들어 내지 않고, 데이터가
-- 허락한 조합만 페이지가 된다.
--
-- ── 통과 기준 (전부 만족해야 한 행이 생긴다) ───────────────────────────────
--   1) 최근 12개월 · 매매 · 아파트 · 취소되지 않은 신고
--   2) 같은 region_name 의 같은 법정동
--   3) 양쪽 단지 모두 그 기간 거래 20건 이상
--   4) 양쪽 모두 그 동에서 거래량 상위 3개 단지 안
--   5) 서비스가 지역 페이지를 가진 62개 지역 이름 안
-- 실측(2026-07-26): 669 조합 / 58 지역 / 265 동. 조건 없이 만들면 8,789 조합이
-- 나왔다 — 그 차이가 곧 "양산하지 않는다"의 크기다.
--
-- ── 사실 우선: 교차 도시 중복 지역을 걸러낸다 ──────────────────────────────
-- 이번에 사이징을 하다 ETL 결함을 하나 찾았다. 이름이 같은 다른 도시의 자치구가
-- **바이트 단위로 동일한** 거래 집합을 들고 있다:
--   광주/대구/대전/부산/울산/인천 동구 — 6곳이 같은 320행
--   대구/대전/부산/울산/인천 중구  — 5곳이 같은 505행 (서울 중구만 별개로 정상)
--   광주/대구/부산/울산 북구, 광주/대구/부산/울산 남구, 광주/대구/대전/부산 서구
-- 표본 주소가 `중구 남대문로5가 827`(서울), `동구 범일동 105-1`(부산)인 것으로 보아
-- 수집 때 시(市) 구분 없이 같은 응답을 여러 지역에 복사해 넣은 것으로 보인다.
-- 원인 수정은 ETL 쪽 일이고 이 마이그레이션의 범위가 아니다. 다만 그 사이에
-- "인천 중구의 실거래"라고 다른 도시 숫자를 적어 두는 일은 없어야 하므로,
-- 여기서 **지역 서명이 다른 지역과 겹치면 통째로 제외**한다.
-- 서명은 (건수 · 단지 수 · 최소/최대 단지명 · 최신 계약월). 목록을 손으로 박아 두지
-- 않고 매 갱신마다 다시 계산하므로, ETL 이 고쳐지면 그 지역들은 자동으로 돌아온다.
-- (검증: md5(string_agg(...)) 전수 지문과 이 서명이 지목하는 23개 지역이 정확히 일치)
--
-- ── 이름에 '--' 가 든 단지를 뺀다 ──────────────────────────────────────────
-- URL 이 `/complex/compare/{A}--{B}--{regionId}` 형태라 구분자가 이름에 섞이면
-- 파싱이 어긋난다. 그런 단지는 조합 자체를 만들지 않는다(잘못 파싱된 페이지를
-- 내보내느니 페이지가 없는 편이 정확하다).

-- ── 1) MV 생성 ─────────────────────────────────────────────────────────────
-- WITH NO DATA. 채우는 일은 갱신 함수(3번)에 맡긴다 — 마이그레이션 트랜잭션을
-- 오래 붙잡지 않고, 매일 도는 그 경로로 채우면 경로 검증까지 같이 된다.
create materialized view if not exists market_agg.complex_pair_mv as
with win as (
  select region_name, complex_name, address, contract_ym, created_at
    from public.market_transactions
   where transaction_type = 'trade'
     and property_type = 'apartment'
     and coalesce(is_cancelled, false) = false
     and contract_ym >= to_char((now() at time zone 'Asia/Seoul') - interval '12 months', 'YYYYMM')
     and address is not null
     and complex_name is not null
     and region_name is not null
),
sig as (
  select region_name,
         count(*)::text || '|' || count(distinct complex_name)::text || '|' ||
         min(complex_name) || '|' || max(complex_name) || '|' || max(contract_ym) as s
    from win
   group by 1
),
dup_region as (
  select region_name from sig where s in (select s from sig group by s having count(*) > 1)
),
scope as (
  select * from win
   where position('--' in complex_name) = 0
     and region_name not in (select region_name from dup_region)
     and region_name in (
       '강남구','서울 강남구','강동구','서울 강동구','강북구','서울 강북구','강서구','서울 강서구',
       '관악구','서울 관악구','광진구','서울 광진구','구로구','서울 구로구','금천구','서울 금천구',
       '노원구','서울 노원구','도봉구','서울 도봉구','동대문구','서울 동대문구','동작구','서울 동작구',
       '마포구','서울 마포구','서대문구','서울 서대문구','서초구','서울 서초구','성동구','서울 성동구',
       '성북구','서울 성북구','송파구','서울 송파구','양천구','서울 양천구','영등포구','서울 영등포구',
       '용산구','서울 용산구','은평구','서울 은평구','종로구','서울 종로구','중구','서울 중구',
       '중랑구','서울 중랑구',
       '성남시 분당구','성남 분당구','성남시 수정구','성남 수정구','성남시 중원구','성남 중원구',
       '수원시 영통구','수원 영통구','수원시 장안구','수원 장안구','수원시 팔달구','수원 팔달구',
       '수원시 권선구','수원 권선구',
       '용인시 수지구','용인 수지구','용인시 기흥구','용인 기흥구','용인시 처인구','용인 처인구',
       '고양시 일산동구','고양 일산동구','고양시 일산서구','고양 일산서구','고양시 덕양구','고양 덕양구',
       '안양시 동안구','안양 동안구','안양시 만안구','안양 만안구',
       '부천시','광명시','하남시','남양주시','김포시','의정부시',
       '안산시 단원구','안산 단원구','안산시 상록구','안산 상록구',
       '화성시 동탄','화성 동탄','과천시','의왕시','군포시','구리시','시흥시','평택시',
       '연수구','인천 연수구','남동구','인천 남동구','부평구','인천 부평구','서구','인천 서구',
       '미추홀구','인천 미추홀구','계양구','인천 계양구','인천 중구'
     )
),
base as (
  -- 주소에서 법정동 토큰(…동/…가/…읍/…면)을 뽑는다. group by 는 위치 참조라야
  -- 상관 서브쿼리를 그대로 묶을 수 있다.
  select region_name,
         complex_name,
         (select t from regexp_split_to_table(address, ' ') t where t ~ '(동|가|읍|면)$' limit 1) as dong,
         count(*)::integer as trade_count,
         max(contract_ym) as last_contract_ym,
         max(created_at) as last_data_at
    from scope
   group by 1, 2, 3
),
qualified as (
  select * from base where dong is not null and trade_count >= 20
),
ranked as (
  select *, row_number() over (partition by region_name, dong order by trade_count desc, complex_name) as rn
    from qualified
),
top3 as (
  select * from ranked where rn <= 3
),
pairs as (
  -- a.complex_name < b.complex_name : 한 조합은 정확히 한 방향으로만 존재한다.
  -- (A,B)와 (B,A)가 둘 다 생기면 같은 내용의 URL 이 두 개가 된다.
  select a.region_name,
         a.dong,
         a.complex_name as complex_a,
         b.complex_name as complex_b,
         a.trade_count as trade_count_a,
         b.trade_count as trade_count_b,
         (a.trade_count + b.trade_count)::integer as pair_trade_count,
         greatest(a.last_contract_ym, b.last_contract_ym) as last_contract_ym,
         greatest(a.last_data_at, b.last_data_at) as last_data_at
    from top3 a
    join top3 b
      on a.region_name = b.region_name
     and a.dong = b.dong
     and a.complex_name < b.complex_name
)
-- 같은 이름의 단지가 한 지역의 두 동에 걸쳐 있을 수 있다. 조회 키를
-- (지역, A, B) 로 유일하게 만들기 위해 거래가 많은 쪽 동 하나만 남긴다.
select distinct on (region_name, complex_a, complex_b)
       region_name, dong, complex_a, complex_b,
       trade_count_a, trade_count_b, pair_trade_count,
       last_contract_ym, last_data_at
  from pairs
 order by region_name, complex_a, complex_b, pair_trade_count desc, dong
  with no data;

comment on materialized view market_agg.complex_pair_mv is
  'N10 단지 비교 랜딩(/complex/compare/[slug]) 화이트리스트. 같은 동·양쪽 12개월 20건 이상·동별 거래 상위 3개 단지 조합만. public.complex_pair_source 로만 읽고 refresh_market_aggregates() 가 갱신한다.';

-- REFRESH ... CONCURRENTLY 의 전제 조건이자 페이지 조회 키.
create unique index if not exists complex_pair_mv_key
  on market_agg.complex_pair_mv (region_name, complex_a, complex_b);

-- 사이트맵 로더의 ORDER BY 와 같은 순서 — index-only scan 이 되도록 나머지를 INCLUDE.
create index if not exists complex_pair_mv_rank
  on market_agg.complex_pair_mv (pair_trade_count desc, region_name, complex_a, complex_b)
  include (dong, trade_count_a, trade_count_b, last_data_at, last_contract_ym);

-- 읽는 주체는 서버 라우트(service_role)뿐이다. market_agg 는 default privileges 로
-- anon·authenticated 를 비워 두었으므로 그 의도대로 service_role 에만 준다.
grant select on market_agg.complex_pair_mv to service_role;

-- ── 2) public 래퍼 뷰 ──────────────────────────────────────────────────────
create or replace view public.complex_pair_source with (security_invoker = on) as
  select region_name, dong, complex_a, complex_b,
         trade_count_a, trade_count_b, pair_trade_count,
         last_contract_ym, last_data_at
    from market_agg.complex_pair_mv;

comment on view public.complex_pair_source is
  'N10 단지 비교 랜딩 화이트리스트 소스. market_agg.complex_pair_mv 를 읽는다.';

-- security_invoker 라 호출 롤의 권한으로 밑단 MV 를 읽는다. 권한이 어긋나면
-- "빈 결과"가 아니라 명시적 42501 로 드러나도록 범위를 똑같이 좁혀 둔다.
revoke all on public.complex_pair_source from anon, authenticated;
grant select on public.complex_pair_source to service_role;

-- ── 3) 갱신 함수에 접어 넣는다 ─────────────────────────────────────────────
-- 새 크론을 만들지 않는다. 이 함수는 이미
--   app/api/cron/market-aggregates-refresh/route.ts (maxDuration 300초)
--   .github/workflows/etl.yml 의 market-agg 단계 (0 0 * * *, 0 9 * * *)
-- 로 매일 두 번 돌고 있다.
create or replace function public.refresh_market_aggregates()
returns jsonb language plpgsql security definer
set search_path = market_agg, public, pg_temp
set statement_timeout = '280s'
as $$
declare
  t0 timestamptz := clock_timestamp();
  result jsonb;
  sitemap_populated boolean;
  pair_populated boolean;
begin
  refresh materialized view concurrently market_agg.tx_band_landing_mv;
  refresh materialized view concurrently market_agg.tx_band_complex_mv;
  refresh materialized view concurrently market_agg.map_price_point_mv;

  -- 비어 있는 MV 에는 CONCURRENTLY 를 쓸 수 없다(Postgres 제약). 최초 1회만
  -- 일반 REFRESH 로 채우고 그 뒤로는 항상 CONCURRENTLY 다.
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

  select jsonb_build_object(
    'ok', true, 'refreshed_at', now(),
    'duration_ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int,
    'rows', jsonb_build_object(
      'tx_band_landing', (select count(*) from market_agg.tx_band_landing_mv),
      'tx_band_complex', (select count(*) from market_agg.tx_band_complex_mv),
      'map_price_point', (select count(*) from market_agg.map_price_point_mv),
      'complex_sitemap', (select count(*) from market_agg.complex_sitemap_mv),
      'complex_pair', (select count(*) from market_agg.complex_pair_mv))
  ) into result;
  return result;
end;
$$;

revoke all on function public.refresh_market_aggregates() from public, anon, authenticated;
grant execute on function public.refresh_market_aggregates() to service_role;
