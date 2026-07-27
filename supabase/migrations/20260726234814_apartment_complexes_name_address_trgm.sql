-- apartment_complexes 이름·주소 trigram GIN — /complex/[id] 의 단지 마스터 매칭용
--
-- 배경: lib/complex/complex-store.ts enrichFromApartmentComplex 가
--   source_key = 'k-apt-basic' AND name ILIKE '%<핵심어>%' AND address ILIKE '%<시군구>%'
-- 로 K-apt 대장 마스터를 찾는다. 앞뒤 % 라 두 필터 모두 인덱스를 못 타고,
-- source_key 인덱스 스캔이 해당 네임스페이스 21,668행을 전부 훑었다.
--
-- 측정(2026-07-26, hot):
--   변경 전 : Index Scan (source_key) · Rows Removed by Filter 21,668 · 2,445 ms
--   변경 후 : Bitmap Index Scan (name_trgm)                        ·   152 ms
--             Bitmap Index Scan (address_trgm, '%강남구%')         ·    19 ms
--
-- 프로덕션에서는 이 조회가 8초 statement timeout 에 걸려
--   "apartment_complexes 조회 실패: canceling statement due to statement timeout"
-- 으로 잘리고 있었다(Vercel 런타임 오류 /complex/[id] 최다 항목).
--
-- 가산만 — 기존 인덱스는 그대로 두고 두 개를 더한다.

create extension if not exists pg_trgm;

create index if not exists apartment_complexes_name_trgm
  on public.apartment_complexes using gin (name gin_trgm_ops);

create index if not exists apartment_complexes_address_trgm
  on public.apartment_complexes using gin (address gin_trgm_ops);

analyze public.apartment_complexes;
