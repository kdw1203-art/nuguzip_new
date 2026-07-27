-- 관심 지역 검색 RPC (2026-07-27)
--
-- 왜 만들었나
-- ────────────────────────────────────────────────────────────────────────────
-- 가입(/signup)과 온보딩(/welcome)의 "관심 지역"은 코드에 박아 둔 목록이었다.
-- /signup 은 `["안양 관양동","서울 마포구","과천시"]` 3개가 전부였고, 그 옆의
-- "⌕ 검색"은 핸들러가 없는 <span> 이라 눌러도 아무 일도 일어나지 않았다.
-- 사용자가 사는 동네가 목록에 없으면 고를 방법 자체가 없었다는 뜻이다.
--
-- 왜 legal_regions 인가
-- ────────────────────────────────────────────────────────────────────────────
-- 시군구 265개가 lawd_cd·display_name·좌표까지 갖춰 정리돼 있고, 실거래
-- (market_transactions.region_code) 가 전건 이 표에 붙는다(219/219 확인).
-- display_name 은 "서울 마포구"·"성남 분당구"·"과천시"처럼 이미 사람이 쓰는
-- 표기라, 기존 소비처(/api/me/alerts value, /notes/new?region=, 홈 개인화)에
-- 그대로 넣어도 형식을 바꿀 필요가 없다.
--
-- 왜 거래량 통계를 같이 주지 않는가
-- ────────────────────────────────────────────────────────────────────────────
-- 붙여 보고 뺐다. 지역별 최근 6개월 거래 건수를 lateral 로 세면
-- EXPLAIN ANALYZE 기준 9,294ms 가 나온다(265개 지역 × 인덱스 스캔, 68k 페이지
-- 읽기). 한 글자 칠 때마다 부를 엔드포인트에 넣을 수 있는 비용이 아니다.
-- 기본 목록 순서는 legal_regions.priority(이미 큐레이션된 값)를 쓴다.
--
-- 오타 내성
-- ────────────────────────────────────────────────────────────────────────────
-- 앞글자 일치를 우선하되, 안 걸리면 트라이그램 유사도로 흡수한다.
-- pg_trgm 은 extensions 스키마에 있어 search_path 에 함께 적어야 한다.

create or replace function public.search_regions(
  p_q text default null,
  p_limit int default 12
)
returns table (
  lawd_cd text,
  display_name text,
  sido text,
  sigungu text,
  lat double precision,
  lng double precision,
  score double precision
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $$
  with q as (
    select
      lower(regexp_replace(coalesce(p_q, ''), '\s+', '', 'g')) as nq,
      greatest(1, least(30, coalesce(p_limit, 12)))            as lim
  ),
  scored as (
    select
      r.lawd_cd,
      r.display_name,
      r.sido,
      r.sigungu,
      r.lat::double precision  as lat,
      r.lng::double precision  as lng,
      r.priority,
      case
        when q.nq = '' then 0
        -- 정확 일치가 가장 강하다: "서울마포구" / "마포구"
        when lower(regexp_replace(r.display_name, '\s+', '', 'g')) = q.nq then 100
        when lower(r.sigungu) = q.nq then 95
        -- 앞글자 일치: "마포" → 마포구, "분당" → 성남 분당구
        when lower(r.sigungu) like q.nq || '%' then 90
        /* 시도 이름만 친 경우("경기")는 display_name 접두 일치(85)보다 **먼저**
           본다. 뒤에 두면 "경기 의왕시"처럼 표기에 시도가 붙은 곳만 85 로 올라와
           목록 앞을 차지하고, 정작 유명한 곳(화성시·성남 분당구)은 밀린다. */
        when lower(r.sido) = q.nq then 80
        when lower(regexp_replace(r.display_name, '\s+', '', 'g')) like q.nq || '%' then 85
        when lower(regexp_replace(r.display_name, '\s+', '', 'g')) like '%' || q.nq || '%' then 70
        /* 표기 흔들림·오타: "해운데" → 부산 해운대구.
           display_name 과 sigungu 중 더 닮은 쪽을 본다 — 앞에 시도가 붙은 이름은
           질의가 짧을수록 유사도가 깎여서, sigungu 를 같이 안 보면 못 찾는다
           (similarity('부산해운대구','해운데')=0 · similarity('해운대구','해운데')=0.286). */
        else 30 + 40 * greatest(
               similarity(lower(regexp_replace(r.display_name, '\s+', '', 'g')), q.nq),
               similarity(lower(r.sigungu), q.nq)
             )
      end as score
    from public.legal_regions r
    cross join q
    where r.enabled
  )
  select
    s.lawd_cd, s.display_name, s.sido, s.sigungu, s.lat, s.lng, s.score
  from scored s
  cross join q
  -- 빈 질의는 "인기 지역" 기본 목록, 질의가 있으면 유사도 하한(trgm 0.25) 아래는 버린다.
  where (q.nq = '' or s.score >= 40)
  order by
    s.score desc,
    s.priority desc nulls last,
    s.display_name
  limit (select lim from q);
$$;

comment on function public.search_regions(text, int) is
  '관심 지역 자동완성 — legal_regions(265개 시군구) 이름 매칭. 빈 질의는 priority 순 인기 목록.';

-- 익명 사용자도 쓴다: 가입 화면은 로그인 전 화면이다.
grant execute on function public.search_regions(text, int) to anon, authenticated, service_role;
