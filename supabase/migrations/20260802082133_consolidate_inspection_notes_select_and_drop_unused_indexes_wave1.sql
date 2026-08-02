-- ============================================================
-- 항목 30 · 1차 — inspection_notes 공개 SELECT 정책 통합 + 미사용 인덱스 정리
-- (원격 적용 완료: 2026-08-02, supabase_migrations.schema_migrations 20260802082133)
--
-- 1) inspection_notes: anon 에 적용되는 permissive SELECT 정책이 2개
--    (inspection_notes_public_read, inspection_notes_select_public_published)
--    라서 행마다 두 식을 평가했다. 두 조건의 OR 로 하나로 합친다 —
--    가시성 집합은 변하지 않는다(둘 다 permissive = 합집합이었다).
--    authenticated 쪽 소유자/관리자 정책(uid·email 이원 체계)은 손대지 않는다.
--
-- 2) 미사용 인덱스 정리(코드 경로 대조 완료, pg_stat idx_scan=0):
--    - chat_messages_room_idx: (room_id, created_at) — room_created_idx(DESC)와 중복
--    - chat_messages_author_idx: author_id 는 코드가 조회하지 않는 레거시 컬럼
--    - chat_messages_sender_idx: sender_email 로 필터하는 쿼리 없음(select 만)
--    - chat_rooms_owner_idx: owner_id 레거시 컬럼
--    - chat_rooms_topic_idx: topic 조회 경로 없음
--    - chat_rooms_created_by_idx: created_by_email 필터 없음
--    - ai_analysis_runs_author_created_idx: lower(author_email) 표현식 —
--      코드는 eq(author_email) 정확 일치만 쓴다(author_complex_idx 가 담당)
--    - ai_analysis_runs_author_district_idx: district_id 필터 경로 없음
--    - ai_analysis_runs_platform_created_idx: platform 필터 경로 없음
--    유지: chat_messages_search_idx(FTS 전환 대비), chat_rooms_expert_id_idx ·
--    idx_ai_analysis_runs_preset_id(FK 지원), meeting_id · type_last_message ·
--    room_created · author_complex(실사용).
--
-- 되돌림(rollback):
--   CREATE INDEX chat_messages_room_idx ON public.chat_messages (room_id, created_at);
--   CREATE INDEX chat_messages_author_idx ON public.chat_messages (author_id, created_at DESC);
--   CREATE INDEX chat_messages_sender_idx ON public.chat_messages (lower(btrim(sender_email)), created_at DESC);
--   CREATE INDEX chat_rooms_owner_idx ON public.chat_rooms (owner_id, created_at DESC);
--   CREATE INDEX chat_rooms_topic_idx ON public.chat_rooms (topic) WHERE topic IS NOT NULL;
--   CREATE INDEX chat_rooms_created_by_idx ON public.chat_rooms (lower(btrim(created_by_email)), created_at DESC);
--   CREATE INDEX ai_analysis_runs_author_created_idx ON public.ai_analysis_runs (lower(author_email), created_at DESC);
--   CREATE INDEX ai_analysis_runs_author_district_idx ON public.ai_analysis_runs (author_email, district_id, created_at DESC);
--   CREATE INDEX ai_analysis_runs_platform_created_idx ON public.ai_analysis_runs (platform, created_at DESC);
--   (정책 되돌림은 아래 DROP/CREATE 를 역순으로)
-- ============================================================

-- 1) 공개 SELECT 정책 통합 (가시성 = 기존 두 정책의 합집합, 변화 없음)
DROP POLICY IF EXISTS inspection_notes_public_read ON public.inspection_notes;
DROP POLICY IF EXISTS inspection_notes_select_public_published ON public.inspection_notes;
CREATE POLICY inspection_notes_select_public ON public.inspection_notes
  FOR SELECT TO anon, authenticated
  USING (
    (is_public = true AND slug IS NOT NULL AND length(btrim(slug)) > 0)
    OR (is_public = true AND published_at IS NOT NULL AND status = 'analyzed'::text)
  );

-- 2) 미사용 인덱스 정리
DROP INDEX IF EXISTS public.chat_messages_room_idx;
DROP INDEX IF EXISTS public.chat_messages_author_idx;
DROP INDEX IF EXISTS public.chat_messages_sender_idx;
DROP INDEX IF EXISTS public.chat_rooms_owner_idx;
DROP INDEX IF EXISTS public.chat_rooms_topic_idx;
DROP INDEX IF EXISTS public.chat_rooms_created_by_idx;
DROP INDEX IF EXISTS public.ai_analysis_runs_author_created_idx;
DROP INDEX IF EXISTS public.ai_analysis_runs_author_district_idx;
DROP INDEX IF EXISTS public.ai_analysis_runs_platform_created_idx;
