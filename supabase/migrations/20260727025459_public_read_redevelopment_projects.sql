-- redevelopment_projects 에 공개 읽기 정책을 연다 (추가 전용 — 지우는 것 없음).
--
-- ── 왜 지금 여는가 ────────────────────────────────────────────────────────
-- 이 표는 RLS 가 켜져 있고 정책이 하나도 없다(deny-all). anon SELECT 권한은
-- 이미 있으므로 anon 키로 질의하면 **에러 없이 0행**이 돌아온다. 즉 "권한이
-- 없다"가 아니라 "그런 사업장이 없다"로 읽힌다 — 이 서비스에서 가장 피하고
-- 싶은 종류의 거짓말이고, 20260726140000 이 complex_pair_mv·
-- market_temperature_snapshot 에서 이미 같은 이유로 고친 자리다.
--
-- lib/redevelopment/store.ts 는 지금 그 0행을 시드 폴백으로 덮어서 화면상으로는
-- 티가 나지 않는다. 그런데 시드는 2026-07-22 에 적재한 40건을 그대로 코드에
-- 박아 둔 스냅샷이다. DB 가 갱신되는 순간(ingest.ts) 시드는 옛 사실이 되고,
-- 조회가 실패하거나 anon 으로 내려가면 **옛 사실이 현재 사실인 척** 나간다.
-- 같은 커밋에서 그 폴백을 걷어내는데, 권한을 먼저 열지 않으면 폴백을 걷어낸
-- 순간 anon 경로가 빈 목록을 렌더한다. 그래서 권한이 먼저다.
--
-- ── 왜 anon 에 여는 것이 안전한가 ─────────────────────────────────────────
-- 이 표의 모든 컬럼(name·type_key·stage_key·sido·sigungu·address·lat·lng·
-- households·summary·source·source_url)은 이미 공개 페이지 /redevelopment 와
-- /map 정비사업 레이어에 그대로 렌더된다. 새로 열어 주는 정보가 아니라, 빌드와
-- 폴백 경로가 자기가 인쇄할 내용을 읽게 하는 것뿐이다. 개인정보·사용자 데이터는
-- 이 표에 없다 — 공개 자료를 정리한 큐레이션 40행이다.
--
-- ── 성능 (anon statement_timeout = 3s) ────────────────────────────────────
-- 40행짜리 표다. 3초 예산과 무관하다.

-- 읽기 정책만 만든다. insert/update/delete 정책은 두지 않으므로 RLS 가 켜진 이상
-- 쓰기는 정책을 우회하는 service_role 로만 가능하다(ingest 가 그 경로를 쓴다).
grant select on public.redevelopment_projects to anon, authenticated;

drop policy if exists redevelopment_projects_public_read
  on public.redevelopment_projects;
create policy redevelopment_projects_public_read
  on public.redevelopment_projects
  for select
  to anon, authenticated
  using (true);

comment on policy redevelopment_projects_public_read
  on public.redevelopment_projects is
  '공개 큐레이션 — /redevelopment 와 /map 정비사업 레이어에 그대로 렌더되는 행이다. '
  'anon 이 읽을 수 있어야 "조회 실패"가 "사업장 없음"으로 둔갑하지 않는다. '
  '쓰기 정책은 없다(ingest 의 service_role 만 쓴다).';
