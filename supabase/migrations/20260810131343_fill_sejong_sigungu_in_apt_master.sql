-- 단지 대장 metadata.sigungu 빈칸 216행을 채운다 — 전부 세종특별자치시 (2026-08-10 실측).
--
-- 세종은 시군구 층위가 없는 특별자치시라 K-apt API 의 as2(시군구명)가 빈 채로
-- 온다. 표시용 보조 필드라 조회는 lawd_cd 로 되지만, 목록에서 지역이 빈칸으로
-- 보였다(데이터 품질 검사 master_sigungu_blank 216). 법정동코드 체계에서
-- 36110 의 시군구명 슬롯은 "세종특별자치시" 그 자체이므로 그 값으로 채운다 —
-- 지어낸 이름이 아니라 코드 체계의 사실이다. 실측으로 216행 전부
-- metadata->>'sido' = '세종특별자치시' 임을 확인하고 조건에도 걸었다.
-- 적재 경로(lib/national-data/apartment-ingest.ts toRpcRow)도 같은 날 같은
-- 규칙(특별자치시 → 시도명 폴백)으로 고쳐 다음 수집부터 재발하지 않는다.
--
-- 적용: 2026-08-10 13:13 UTC, MCP apply_migration (원격 선적용 → 이 파일은 미러).
--
-- 되돌리기:
--   update public.apartment_complexes
--      set metadata = jsonb_set(metadata, '{sigungu}', '""')
--    where source_key = 'k-apt-basic'
--      and metadata->>'sido' = '세종특별자치시'
--      and metadata->>'sigungu' = '세종특별자치시';
update public.apartment_complexes
   set metadata = jsonb_set(metadata, '{sigungu}', to_jsonb('세종특별자치시'::text))
 where source_key = 'k-apt-basic'
   and coalesce(metadata->>'sigungu', '') = ''
   and metadata->>'sido' = '세종특별자치시';
