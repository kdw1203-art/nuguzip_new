-- 관심 지역 검색 RPC — 정식 행정명("경기 성남시 분당구")으로 찾으면 못 찾던 것 (2026-08-06)
--
-- 무엇이 틀렸나
-- ────────────────────────────────────────────────────────────────────────────
-- legal_regions.display_name 은 **두 가지 표기가 섞여 있다**. 어떤 행은 시도가
-- 붙어 있고("경기 안성시", "경기 이천시"), 어떤 행은 안 붙어 있다("화성시",
-- "부천 원미구"). 2026-07-27 판 함수는 display_name 과 sigungu 만 봤기 때문에,
-- 사람이 정식 행정명 그대로 친 질의는 어느 쪽에도 걸리지 않고 트라이그램
-- 유사도로 떨어졌다. 그리고 유사도는 **시도가 붙은 행에 유리하다** — 질의에
-- 있는 "경기" 세 글자를 그쪽만 가지고 있으니까.
--   similarity('경기안성시','경기화성시') = 0.433
--   similarity('화성시',    '경기화성시') = 0.400
-- 그래서 "경기 화성시" 를 치면 **안성시가 1등**이었다. 오타를 낸 것도 아니고
-- 주소를 정확히 친 사람이 다른 시를 받았다.
--
-- 바꾸기 전 상태를 전수로 세어 뒀다 (enabled 252개를 각각 `sido || ' ' || sigungu`
-- 로 조회, 1등이 자기 자신인가):
--     맞음 217 · 0건 22 · **다른 지역 13**
--   다른 지역 13 = 과천시→이천시, 광주시→파주시, 안산 단원구·상록구→안성시,
--                  안양 동안구·만안구→안성시, 양주시→양평군, 여주시→파주시,
--                  포천시→이천시, 화성시→안성시, 창원 성산구·의창구·진해구→창녕군
--   0건 22 = 고양·부천·성남·수원·용인·포항·천안·청주의 모든 구
-- 이 22개는 /map?region= 링크가 조용히 기본 수도권 화면으로 떨어지던 경로다.
-- 바꾼 뒤 같은 조사: **맞음 252 · 0건 0 · 다른 지역 0**.
--
-- 어떻게 고쳤나
-- ────────────────────────────────────────────────────────────────────────────
-- 행마다 비교 키를 네 벌 만들어 둔다. 표기가 흔들리는 건 데이터 쪽이므로,
-- 질의를 고치는 게 아니라 **비교 대상을 넓힌다**.
--     k_full     = 시도+시군구        "경기성남시분당구"
--     k_sg       = 시군구             "성남시분당구"
--     k_dn       = display_name       "성남분당구"
--     k_dn_bare  = display_name 에서 그 행 자신의 시도 접두어를 뗀 것
-- 질의 쪽도 대칭으로 한 벌 더 만든다. nq_body = 질의에서 **그 행의** 시도
-- 접두어를 뗀 나머지. "경기성남시분당구" 는 경기도 행에서만 "성남시분당구" 가
-- 되고, 부산 행에서는 null 이다. (예전 초안은 질의의 시도를 전역으로 한 번
-- 찾아내는 lateral 을 썼는데, 표를 한 번 더 훑는 값이라 행별 계산으로 바꿨다.)
--
-- k_dn_bare 에 `length(k_dn) - length(k_sido) >= 2` 조건이 붙은 이유:
-- 세종특별자치시의 display_name 은 "세종시" 라 시도 접두어를 떼면 **"시"** 한
-- 글자가 남는다. 그러면 질의 "시" 가 세종시에 100점으로 붙어 버린다. 실측으로
-- 걸렸다.
--
-- 시도만 친 질의(80점) 를 시군구 쪽 접두 규칙 **아래**에 둔 것도 실측 결과다.
-- 위로 올리면 "서"→서울 성동구, "광주"→광주 서구, "부산"→부산 해운대구 가 되어
-- 지금 잘 나오던 서초구·광주시·부산진구를 밀어낸다.
--
-- 왜 CTE 에 `materialized` 가 붙어 있나 — 이건 취향이 아니라 4배다
-- ────────────────────────────────────────────────────────────────────────────
-- 처음엔 안 붙이고 썼는데 느렸다. 같은 조건에서 잰 값(질의 10개 × Memoize 통과,
-- EXPLAIN ANALYZE 의 Execution Time / 실제 호출 수):
--     예전 함수            4.22 ms/call
--     새 함수, 그냥 CTE   16.4  ms/call   ← 4배 느림
--     새 함수, materialized 4.63 ms/call
-- 이유는 PostgreSQL 이 CTE 를 인라인하면서 **k_dn 같은 이름을 쓰는 자리마다
-- 정의식을 통째로 다시 붙이기** 때문이다. 실행계획을 열어 보면 하나의 CASE 안에
-- lower(regexp_replace(display_name, ...)) 가 열댓 번 나오고, 그게 WHERE 와
-- ORDER BY 에서 또 반복된다. 공통식 제거를 해 주지 않는다. `materialized` 는
-- 정규화를 행당 한 번으로 못 박는다. 비용의 정체는 similarity() 가 아니었다 —
-- 정규화 CTE 만 따로 재면 252행에 0.05ms 다.
--
-- 남은 4.63 vs 4.22 ms 차이(+10%)는 키가 2벌→4벌, 등급이 6→9로 늘어난 값이다.
-- 한 글자 칠 때마다 부르는 엔드포인트라 이 정도는 지불할 만하다고 봤다.
--
-- 안 건드린 것 / 여전히 안 되는 것
-- ────────────────────────────────────────────────────────────────────────────
-- · 오타 경로는 그대로다. "해운데"→부산 해운대구(41), "강남귀"→서울 강남구(43)
--   로 예전과 점수까지 같다. "화송시"·"경기 화송시" 는 예전에도 0건이었고
--   지금도 0건이다(트라이그램 0.143 → 35.7 < 40). 바뀐 게 아니라 원래 그렇다.
-- · 1,287개 질의(정식명·display_name·시군구·시도·시군구 어간·1/3/4글자 접두)를
--   전건 대조: 같음 1182 · 바뀜 105 · **새로 찾음 43 · 새로 0건이 된 것 0**.
--   바뀐 105건은 손으로 다 봤다. 개선이거나, 동구·중구·서구·남구·북구·강서구·
--   고성군처럼 여러 시도에 같은 이름이 있어 100점 동점이 priority 로 갈리는
--   경우다. 시도 없이 "중구" 만 친 질의에 하나를 고르는 건 원래 임의다.
-- · **좌표는 이 마이그레이션이 손대지 않는다.** enabled 252행 중 183행(73%)이
--   lat/lng 가 null 이다. 그래서 이제 인천 연수구·부천 원미구를 *찾기는* 하지만
--   /map 의 resolveRegionFocus 는 여전히 null 을 받아 기본 화면으로 떨어진다.
--   좌표 채우기는 별도 배치다(complex_geocode 중앙값으로 183 중 52 채울 수 있고,
--   좌표가 이미 있는 63행에 대조해 p50 1.29km / p90 2.31km / 최대 5.58km 확인).
--
-- 되돌리기
-- ────────────────────────────────────────────────────────────────────────────
-- 이 파일은 함수 본문만 교체한다(시그니처·반환형·권한 동일). 되돌리려면
-- supabase/migrations/20260727140000_search_regions.sql 의
-- `create or replace function public.search_regions(...)` 블록과 그 뒤의
-- comment·grant 두 줄을 그대로 다시 실행하면 된다. 표 구조 변경 없음.

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
  /* `materialized` 는 전부 의도한 것이다. 빼면 PostgreSQL 이 CTE 를 인라인하면서
     정규화식(lower(regexp_replace(...)))을 사용처마다 복제해 호출당 4.22ms →
     16.4ms 가 된다. 붙이면 4.63ms. 실측 근거는 이 파일 머리말에 있다.
     (`\sf public.search_regions` 로 본문만 보는 사람을 위해 숫자를 여기 남긴다.) */
  with q as materialized (
    select
      lower(regexp_replace(coalesce(p_q, ''), '\s+', '', 'g')) as nq,
      greatest(1, least(30, coalesce(p_limit, 12)))            as lim
  ),
  norm as materialized (
    select
      r.lawd_cd,
      r.display_name,
      r.sido,
      r.sigungu,
      r.lat::double precision as lat,
      r.lng::double precision as lng,
      r.priority,
      lower(regexp_replace(r.sido || r.sigungu, '\s+', '', 'g')) as k_full,
      lower(regexp_replace(r.sigungu,           '\s+', '', 'g')) as k_sg,
      lower(regexp_replace(r.display_name,      '\s+', '', 'g')) as k_dn,
      lower(r.sido)                                              as k_sido
    from public.legal_regions r
    where r.enabled
  ),
  cand as materialized (
    select
      n.*,
      /* display_name 에서 자기 시도 접두어를 뗀다.
         >= 2 는 세종시("세종시" → "시") 를 막는 실측 가드다. */
      case
        when n.k_dn like n.k_sido || '%'
             and length(n.k_dn) - length(n.k_sido) >= 2
        then substr(n.k_dn, length(n.k_sido) + 1)
        else n.k_dn
      end as k_dn_bare,
      /* 질의에서 **이 행의** 시도 접두어를 뗀 나머지. 다른 시도 행에서는 null. */
      case
        when q.nq like n.k_sido || '%'
             and length(q.nq) > length(n.k_sido)
        then substr(q.nq, length(n.k_sido) + 1)
      end as nq_body,
      q.nq
    from norm n
    cross join q
  ),
  scored as materialized (
    select
      c.*,
      case
        when c.nq = '' then 0

        -- 정확 일치. 네 벌 중 하나만 맞아도 100 — 표기가 어느 쪽이든 상관없게.
        when c.nq in (c.k_full, c.k_sg, c.k_dn, c.k_dn_bare) then 100
        -- "경기성남시분당구" 에서 시도를 뗀 "성남시분당구" 가 맞는 경우.
        when c.nq_body in (c.k_sg, c.k_dn_bare)              then 100

        -- 앞글자 일치(시군구 쪽). "분당" → 성남 분당구, "마포" → 마포구.
        when c.k_sg like c.nq || '%' or c.k_dn_bare like c.nq || '%' then 90
        /* 앞글자 일치(시도 포함 쪽). length 조건이 없으면 "경기" 두 글자가
           k_full 접두로 걸려 아래 80 등급을 통째로 잡아먹는다. */
        when length(c.nq) > length(c.k_sido)
             and (c.k_full like c.nq || '%' or c.k_dn like c.nq || '%') then 90
        when c.k_sg like c.nq_body || '%' or c.k_dn_bare like c.nq_body || '%' then 88

        /* 시도 이름만 친 경우("경기", "부산"). **반드시 위 두 규칙 아래**.
           올리면 "서"→서초구, "광주"→광주시, "부산"→부산진구 가 밀린다(실측). */
        when c.k_sido like c.nq || '%' then 80

        when c.k_full like '%' || c.nq || '%' or c.k_dn like '%' || c.nq || '%' then 70

        /* 표기 흔들림·오타: "해운데" → 부산 해운대구.
           앞에 시도가 붙은 이름은 질의가 짧을수록 유사도가 깎이므로 시군구 쪽도
           같이 본다(similarity('부산해운대구','해운데')=0 · ('해운대구','해운데')=0.286).
           nq_body 쪽은 다른 시도 행에서 null 이라 coalesce 로 0 처리한다. */
        else 30 + 40 * greatest(
               similarity(c.k_dn, c.nq),
               similarity(c.k_sg, c.nq),
               coalesce(
                 greatest(similarity(c.k_sg, c.nq_body), similarity(c.k_dn_bare, c.nq_body)),
                 0)
             )
      end as score
    from cand c
  )
  select
    s.lawd_cd, s.display_name, s.sido, s.sigungu, s.lat, s.lng, s.score
  from scored s
  -- 빈 질의는 "인기 지역" 기본 목록, 질의가 있으면 유사도 하한(trgm 0.25) 아래는 버린다.
  where (s.nq = '' or s.score >= 40)
  order by
    s.score desc,
    s.priority desc nulls last,
    s.display_name
  limit (select lim from q);
$$;

comment on function public.search_regions(text, int) is
  '관심 지역 자동완성 — legal_regions(265개 시군구) 이름 매칭. 정식 행정명("경기 성남시 분당구")·display_name("성남 분당구")·시군구("성남시 분당구") 어느 표기로 쳐도 같은 행을 찾는다. 빈 질의는 priority 순 인기 목록.';

-- 익명 사용자도 쓴다: 가입 화면은 로그인 전 화면이다.
grant execute on function public.search_regions(text, int) to anon, authenticated, service_role;
