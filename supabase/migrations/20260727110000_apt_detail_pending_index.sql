-- 단지 상세 백필이 진행될수록 **느려지다가 스스로 멈추는** 구조를 고친다.
--
-- 증상(2026-07-27 실측, market_ingest_log): apt-detail 라운드가 후반에 연속 실패했다.
--   09:42:17  ok     처리=600 병합=600 실패=0
--   09:42:28  error  처리=0 병합=0 실패=600 · canceling statement due to statement timeout
--   09:42:45  error  처리=600 병합=31 실패=569
--   09:42:57  error  처리=600 병합=0 실패=600
--
-- 원인: 대상 조회가 "아직 상세를 안 받은 행"을 찾을 때
-- metadata->'detailFetchedAt' IS NULL 을 인덱스 없이 필터로만 걸었다. EXPLAIN 실측:
--     Rows Removed by Filter: 11204     ← 이미 끝낸 행을 전부 훑고 지나간다
--     Execution Time: 2855 ms
-- 즉 백필이 진행될수록(끝낸 행이 쌓일수록) 이 조회가 선형으로 느려진다.
-- service_role 의 statement_timeout 이 8초라, 대상 21,688건 중 3만... 이 아니라
-- 실제로는 1만 건대 후반부터 8초에 닿아 영구 타임아웃으로 백필이 완주하지 못한다.
-- 위 로그가 정확히 그 초입이다.
--
-- 해법: 조건부(부분) 인덱스. "아직 안 한 것"만 담으므로 처리할수록 인덱스가
-- **작아진다** — 느려지는 대신 빨라진다. 다 끝나면 인덱스도 비어 사실상 사라진다.
--   적용 후 실측: 2,855 ms → 7.6 ms (375배)
--
-- 조건식은 앱이 실제로 보내는 것과 글자 그대로 같아야 인덱스를 탄다.
-- PostgREST 의 .is("metadata->detailFetchedAt", null) → metadata->'detailFetchedAt' is null
-- (->> 가 아니라 -> 이다. 다르게 쓰면 조건이 안 맞아 인덱스를 못 쓴다.)
--
-- source_key 를 선두 컬럼에 둔 이유: 조회가 source_key='k-apt-basic' 로 먼저 좁힌다.
-- (전체 39,392행 중 백필 대상은 이 21,688행뿐이고, 나머지는 REB 별칭이라 상세가 없다.)
create index if not exists apartment_complexes_detail_pending_idx
  on public.apartment_complexes (source_key, external_id)
  where (metadata -> 'detailFetchedAt') is null;
