/*
 * 뷰포트 안 단지들의 상세 필터 속성 (2026-07-27).
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────────
 * 지도 상세 필터(가격·면적·준공·세대수 막대그래프 슬라이더)는 서버에서 렌더한
 * 단지 30개에만 걸렸다. 화면에 실제로 찍히는 마커는 /api/map/clusters 가 주는
 * points(최대 300개)인데, 거기에는 필터로 쓸 값이 하나도 없었다. 그래서 필터를
 * 켜면 그 마커들을 통째로 숨기는 수밖에 없었고, 화면이 거의 비어 버렸다.
 *
 * ── 왜 RPC 인가 (PostgREST 로 두 번 실패했다) ───────────────────────────────
 * complex_tx_stats 를 PostgREST 로 직접 읽으려 했는데 둘 다 막혔다.
 *   1) 단지명 300개를 `in()` 에 넣기 → 한글이 URL 인코딩되면서 쿼리스트링이
 *      10KB 를 넘어 요청 자체가 실패("TypeError: fetch failed").
 *   2) 지역 이름으로만 좁히기 → 서울 한복판 뷰포트는 지역이 10곳 넘고 3만 행이
 *      넘어와 읽기 상한(25초)에 걸림.
 * 좌표로 자르는 게 답인데 complex_tx_stats 에는 좌표가 없다. popular_complexes 와
 * 똑같이 complex_geocode 와 조인해 뷰포트로 자른다 — 한 번의 왕복(실측 382ms).
 *
 * ── 정렬을 맞추는 이유 ──────────────────────────────────────────────────────
 * clusters 라우트는 뷰포트 안 좌표를 trade_count 내림차순으로 300개 고른다.
 * 여기서 다른 순서로 300개를 고르면 "마커는 있는데 속성이 없는 단지"가 생기고,
 * 그 단지는 필터를 켜는 순간 조건과 무관하게 사라진다. 같은 순서를 쓴다.
 */
create or replace function public.map_complex_attrs(
  p_min_lat double precision default null,
  p_max_lat double precision default null,
  p_min_lng double precision default null,
  p_max_lng double precision default null,
  p_limit int default 300
)
returns table (
  region_name text,
  complex_name text,
  avg_price_manwon bigint,
  avg_area_m2 numeric,
  build_year integer,
  households integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    g.region_name, g.complex_name,
    s.avg_price_manwon, s.avg_area_m2, s.build_year, s.households
  from public.complex_geocode g
  join public.complex_tx_stats s
    on s.region_name = g.region_name and s.complex_name = g.complex_name
  where g.status = 'ok' and g.lat is not null and g.lng is not null
    and (p_min_lat is null or g.lat between p_min_lat and p_max_lat)
    and (p_min_lng is null or g.lng between p_min_lng and p_max_lng)
  order by g.trade_count desc nulls last
  limit greatest(1, least(1000, p_limit));
$$;

comment on function public.map_complex_attrs(double precision, double precision, double precision, double precision, int) is
  '지도 마커 상세 필터 속성 — 뷰포트 안 단지의 평균가·면적·준공연도·세대수';

-- 지도는 로그인 없이 쓰는 화면이다.
grant execute on function public.map_complex_attrs(double precision, double precision, double precision, double precision, int)
  to anon, authenticated, service_role;
