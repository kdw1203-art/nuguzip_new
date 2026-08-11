-- [원장 복원] 적용은 됐지만 파일이 없던 마이그레이션을 되살린 것이다.
--
-- 원장(supabase_migrations.schema_migrations) version = 20260811065433, name = tmp_bench_search_preview_v0_cleanup.
-- 아래 본문은 그 원장의 statements 원문 그대로다(md5 6fea4af336d7da099830a6b8bbd8db9d · 116b —
-- 원장 md5 와 바이트 단위 대조 완료). 내가 새로 쓴 문장은 이 머리말뿐이고
-- SQL 은 한 글자도 손대지 않았다. 이 파일이 적용 시점에 쓰였다는 뜻이 아니다.
--
-- 왜 비어 있었나: 2026-08-11 병렬 세션(검색 미리보기 trgm 작업)이 MCP 로 적용하고
-- 파일 미러링을 남기지 않았다. 같은 세션 4건(20260811064459~065433)을 함께 복원했다.
--
-- 위 임시 벤치 함수 제거 — 되돌리기는 20260811065248 본문 재적용.

-- 벤치마크 끝. 임시 함수 제거.
DROP FUNCTION IF EXISTS public.zz_bench_search_preview_v0(text, integer);