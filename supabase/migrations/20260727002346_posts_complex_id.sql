-- posts.complex_id — /complex/[id] "단지 이야기(노트)" 섹션이 실제로 동작하게 만든다.
--
-- 배경: lib/complex/complex-store.ts getComplexPosts 는 예전부터
--   from("posts").select(...).eq("complex_id", complexId)
-- 로 읽어 왔는데, posts 테이블에는 complex_id 컬럼이 없었다. PostgREST 는
--   column posts.complex_id does not exist
-- 를 돌려주고, 예전 코드는 그 오류를 삼켜 빈 배열 → "아직 이 단지에 공개된
-- 임장노트가 없어요" 로 그렸다. 즉 읽기·쓰기 어느 쪽도 연결된 적이 없는
-- 기능이었고, 화면은 그 사실을 "없다"고 잘못 말하고 있었다.
--
-- 664e3e7 에서 삼킴을 없앤 뒤 이 조회가 /complex/[id] 요청 100% 에서 실패로
-- 잡히면서 드러났다 — Vercel 런타임 오류 최다 그룹(2026-07-26 기준 51건/2시간,
-- 모든 /complex/[id] 요청에 1건씩).
--
-- complex_id 는 lib/complex/complex-store.ts encodeComplexId 가 만드는
-- base64url(region + U+0001 + name) 문자열이다. 단지 마스터 테이블이 따로 없어
-- (complexes 테이블은 이 DB 에 존재하지 않는다) FK 는 걸지 않고 text 로 둔다.
-- 대신 쓰기 경로(app/api/community/posts)가 decodeComplexId 로 해독되는 값만
-- 저장해, 존재하지 않는 단지에 글이 매달리지 않게 한다.
--
-- 가산만 — 기존 행은 전부 null 이고, 그건 "이 글은 특정 단지에 연결되지
-- 않았다"는 사실 그대로다. 조회는 이제 정직하게 0건을 돌려준다.

alter table public.posts
  add column if not exists complex_id text;

comment on column public.posts.complex_id is
  '연결된 단지 id — encodeComplexId(region, name) 의 base64url 값. 없으면 단지에 연결되지 않은 글.';

-- getComplexPosts 의 조회 모양 그대로: complex_id 등치 + 최신순.
create index if not exists posts_complex_id_created_idx
  on public.posts (complex_id, created_at desc)
  where complex_id is not null;
