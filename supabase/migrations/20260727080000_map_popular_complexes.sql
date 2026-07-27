-- 지도 좌측 패널 "인기 단지" — 보이는 영역 기준 순위.
--
-- 문제: 지도가 좌표 있는 단지를 전국에서 거래량순 30개만 가져와 놓고, 그중 한
-- 지역 이름을 붙여 "수원 단지 30" 으로 표시했다. 목록에는 안양·창원·수원이
-- 섞여 있었고 지도를 움직여도 그대로였다 — 지역 필터가 아예 없었다.
--
-- 해법: 지도 뷰포트(경위도 범위)를 받아 그 안의 단지만 인기순으로 돌려준다.
-- 범위를 안 주면(줌아웃) 전국 기준으로 같은 순위를 낸다.
--
-- 인기 점수 = 최근 6개월 거래량 + 조회수 × 0.3.
--   실거래 1건은 "돈이 실제로 오간 관심"이라 조회 1회보다 훨씬 강한 신호다.
--   초기에는 트래픽이 적어 사실상 거래량 순이고, 트래픽이 쌓일수록 조회가
--   보조 신호로 섞인다. 가중치는 이 함수 한 곳에서만 바꾸면 된다.

-- ── complex_tx_stats 에 최근 거래량 추가 ───────────────────────────────────
-- 전체 기간 누적만으로는 10년 전에 활발했던 대단지가 계속 상위를 차지한다.
-- 최근 6개월 창을 따로 세어 "지금 거래되는 곳"이 위로 오게 한다.
-- (MV 는 스냅샷이라 이 창은 갱신 시점 기준으로 고정된다 — 하루 두 번 갱신)
drop materialized view if exists public.complex_tx_stats;

create materialized view public.complex_tx_stats as
select
  mt.region_name,
  mt.complex_name,
  min(mt.address) filter (where mt.address is not null and mt.address <> '') as address,
  count(*) filter (
    where mt.transaction_type = 'trade' and coalesce(mt.is_cancelled, false) = false
  )::bigint as trade_count,
  count(*) filter (where coalesce(mt.is_cancelled, false) = false)::bigint as tx_count,
  count(*) filter (
    where mt.transaction_type = 'trade'
      and coalesce(mt.is_cancelled, false) = false
      and mt.contract_ym >= to_char(now() - interval '6 months', 'YYYYMM')
  )::bigint as recent_trade_count
from public.market_transactions mt
where mt.complex_name is not null and mt.complex_name <> ''
  and mt.region_name is not null and mt.region_name <> ''
group by mt.region_name, mt.complex_name;

create unique index complex_tx_stats_pk
  on public.complex_tx_stats (region_name, complex_name);
create index complex_tx_stats_priority_idx
  on public.complex_tx_stats (trade_count desc, tx_count desc);
create index complex_tx_stats_recent_idx
  on public.complex_tx_stats (recent_trade_count desc, trade_count desc);

revoke all on public.complex_tx_stats from anon, authenticated;

-- 뷰포트 질의용 좌표 인덱스 (기존 인덱스는 region_name 용이라 범위 검색에 못 쓴다)
create index if not exists complex_geocode_latlng_idx
  on public.complex_geocode (lat, lng)
  where status = 'ok' and lat is not null and lng is not null;

-- ── 단지 id 계산 ───────────────────────────────────────────────────────────
-- 앱의 encodeComplexId() 와 **정확히** 같은 규칙이어야 한다.
--   lib/complex/complex-store.ts:
--     Buffer.from(`${region}\x01${name}`, "utf8").toString("base64url")
-- 처음에 '|' 구분자 + 표준 base64 로 짰다가 조인이 한 건도 안 맞아 조회수가 항상
-- 0 이 되는 걸 검증에서 잡았다 — "조회수를 섞었다"는 말만 남고 실제로는 거래량
-- 순으로만 정렬되는, 조용히 틀리는 종류의 버그였다.
--
-- base64url 이 표준 base64 와 다른 점 세 가지를 모두 처리한다:
--   1) '+' → '-', '/' → '_'   2) 끝의 '=' 패딩 제거
--   3) Postgres encode(...,'base64') 가 76자마다 넣는 줄바꿈 제거
create or replace function public.complex_id(p_region text, p_name text)
returns text
language sql
immutable
parallel safe
set search_path to 'public'
as $function$
  select rtrim(
    translate(
      replace(
        encode(convert_to(p_region || chr(1) || p_name, 'UTF8'), 'base64'),
        E'\n', ''
      ),
      '+/', '-_'
    ),
    '='
  );
$function$;

-- ── 인기 단지 조회 ─────────────────────────────────────────────────────────
drop function if exists public.popular_complexes(
  double precision, double precision, double precision, double precision, integer
);

create function public.popular_complexes(
  p_min_lat double precision default null,
  p_max_lat double precision default null,
  p_min_lng double precision default null,
  p_max_lng double precision default null,
  p_limit integer default 10
)
returns table(
  complex_id text,
  region_name text,
  complex_name text,
  lat double precision,
  lng double precision,
  trade_count bigint,
  recent_trade_count bigint,
  view_count bigint,
  score numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    public.complex_id(g.region_name, g.complex_name) as complex_id,
    g.region_name,
    g.complex_name,
    g.lat::double precision,
    g.lng::double precision,
    coalesce(s.trade_count, 0)        as trade_count,
    coalesce(s.recent_trade_count, 0) as recent_trade_count,
    coalesce(e.view_count, 0)         as view_count,
    (coalesce(s.recent_trade_count, 0) * 1.0
      + coalesce(e.view_count, 0) * 0.3)::numeric as score
  from public.complex_geocode g
  join public.complex_tx_stats s
    on s.region_name = g.region_name and s.complex_name = g.complex_name
  left join public.complex_engagement e
    on e.complex_id = public.complex_id(g.region_name, g.complex_name)
  where g.status = 'ok'
    and g.lat is not null and g.lng is not null
    and (p_min_lat is null or g.lat between p_min_lat and p_max_lat)
    and (p_min_lng is null or g.lng between p_min_lng and p_max_lng)
  order by score desc, s.trade_count desc, g.complex_name
  limit greatest(1, least(50, p_limit));
$function$;

-- 실행 권한: 공개 지도 API(/api/map/popular)가 쓰는 함수다. 권한이 없으면 service
-- role 키가 있는 환경에서만 동작하고, anon 으로 폴백되는 경로(빌드 프리렌더 등)
-- 에서는 permission denied 로 패널이 통째로 빈다 — 로컬 검증에서 실제로 났다.
--
-- 열어도 되는 이유: 돌려주는 값은 단지명·지역명·좌표·거래 건수·조회수뿐이고 모두
-- 이미 지도 클러스터 API 로 공개되는 것과 같은 종류의 집계다. 원본 테이블은 계속
-- 닫아 두고 정렬·상한(최대 50건)이 고정된 이 함수 하나만 통로로 연다.
grant execute on function public.popular_complexes(
  double precision, double precision, double precision, double precision, integer
) to anon, authenticated;
grant execute on function public.complex_id(text, text) to anon, authenticated;

-- DROP 은 GRANT 도 함께 지운다. SECURITY DEFINER 함수 두 개(complexes_needing_geocode ·
-- popular_complexes)는 소유자 권한으로 돌아서 겉으로는 멀쩡해 보이지만, 나중에 누가
-- 이 MV 를 서비스 클라이언트로 직접 읽으면 permission denied 로 터진다.
-- anon·authenticated 에는 주지 않는다 — 공개 노출은 popular_complexes 함수(정렬·상한
-- 고정)를 통해서만 한다.
grant select on public.complex_tx_stats to service_role;
