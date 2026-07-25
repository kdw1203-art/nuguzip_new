-- D7 — search_complexes 를 실제 단지 대장(k-apt-basic) 행으로 스코프.
--
-- 원격 DB 에 이미 적용된 마이그레이션의 사본이다(supabase/migrations/README.md 규약).
-- version 20260725060721 = supabase_migrations.schema_migrations 의 값과 정확히 일치.
--
-- apartment_complexes 39,362행 중 17,704행(45%)은 단지가 아니라 REB 이름 별칭
-- (reb-name-alias 8,905) · ID 레코드(reb-complex-id 8,799)다. 이 행들은 address 가
-- 빈 문자열이고 metadata 에 kaptCode·approvalDate·heating·roadAddress·sido·sigungu 가
-- 하나도 없다. 그런데 이 함수는 반환 컬럼 대부분을 metadata 에서 뽑으므로, 별칭 행이
-- 매칭되면 이름만 있고 주소·지역·준공년도가 전부 빈 껍데기 행이 나간다.
--
-- 게다가 정렬이 length(ac.name) asc 라 별칭 행이 체계적으로 유리하다 — 별칭은 REB
-- 원본 이름이라 대장 이름보다 짧은 경우가 많다. 실측(수정 전): p_district 없이
-- '자이' 를 조회하면 상위 20건 중 13건이 별칭이고, 상위 5건만 봐도 3건이 주소·지역이
-- 빈 행이며 그중 하나("자이온더퍼스트")는 바로 위 정상 행과 같은 단지의 중복이었다.
-- 'e편한세상' 4/20, '힐스테이트' 2/20 도 같은 증상.
-- 수정 후 같은 질의 6종 모두 별칭 0건·빈 주소 0건이고 반환 건수는 20건 그대로다.
--
-- p_district 를 넘기면 metadata->>'sigungu' 조건에서 별칭이 이미 탈락하므로 증상이
-- 안 보인다. 즉 전국 검색(p_district 생략)에서만 터지는 문제였다.
--
-- 참고: 현재 앱 코드에는 이 RPC 호출부가 없다(app/api/search/unified 는
-- lib/complex/complex-store.ts 의 searchComplexes — market_transactions 직접 조회 — 를
-- 쓴다). 다만 anon/authenticated 에 EXECUTE 가 열려 있어 PostgREST 로 직접 호출
-- 가능한 공개 엔드포인트라, 쓰이지 않는다는 이유로 두지 않고 같이 고친다.
--
-- 데이터 변경 없음 — 함수 정의만 교체한다.

create or replace function public.search_complexes(
  p_query text,
  p_district text default ''::text,
  p_limit integer default 20
)
returns table(
  id text, kapt_code text, name text, city text, district text,
  address text, road_address text, lat double precision, lng double precision,
  building_type text, build_year integer, total_floors integer, households integer,
  parking_per_hh numeric, builder_name text, heating text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    ac.id::text,
    (ac.metadata->>'kaptCode'),
    ac.name,
    coalesce(ac.metadata->>'sido', ''),
    coalesce(ac.metadata->>'sigungu', ''),
    ac.address,
    (ac.metadata->>'roadAddress'),
    null::double precision,
    null::double precision,
    '아파트'::text,
    nullif(left(coalesce(ac.metadata->>'approvalDate',''), 4), '')::int,
    null::int,
    nullif(ac.metadata->>'householdCount', '')::int,
    null::numeric,
    null::text,
    (ac.metadata->>'heating')
  from public.apartment_complexes ac
  where coalesce(p_query, '') <> ''
    and ac.source_key = 'k-apt-basic'
    and ac.name ilike '%' || p_query || '%'
    and (
      coalesce(p_district, '') = ''
      or coalesce(ac.metadata->>'sigungu','') ilike '%' || p_district || '%'
    )
  order by
    (ac.name ilike p_query || '%') desc,
    length(ac.name) asc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$function$;
