-- ============================================================
-- 항목 30 · 3차 — inspection_notes 이원 식별(uid·email) 정책 통합.
-- (원격 적용 완료 2026-08-02 · anon/일반 사용자/관리자 3경로 실쿼리 검증)
--
-- authenticated 각 액션에 3~4개 겹치던 permissive 정책을, OR 합집합 의미를
-- 그대로 보존하며 액션당 1개로 병합한다 — 어느 식별 체계도 빼지 않는다
-- (uid 일치 OR email 일치 OR is_admin() OR is_admin_request() OR 공개조건).
-- anon 은 공개 조건만 가진 별도 정책.
-- ============================================================

DROP POLICY IF EXISTS inspection_notes_admin_all ON public.inspection_notes;
DROP POLICY IF EXISTS inspection_notes_author_all ON public.inspection_notes;
DROP POLICY IF EXISTS inspection_notes_delete_owner_or_admin ON public.inspection_notes;
DROP POLICY IF EXISTS inspection_notes_insert_self ON public.inspection_notes;
DROP POLICY IF EXISTS inspection_notes_select_own_or_admin ON public.inspection_notes;
DROP POLICY IF EXISTS inspection_notes_select_public ON public.inspection_notes;
DROP POLICY IF EXISTS inspection_notes_update_owner_or_admin ON public.inspection_notes;

CREATE POLICY inspection_notes_select_anon ON public.inspection_notes
  FOR SELECT TO anon
  USING (
    (is_public = true AND slug IS NOT NULL AND length(btrim(slug)) > 0)
    OR (is_public = true AND published_at IS NOT NULL AND status = 'analyzed'::text)
  );

CREATE POLICY inspection_notes_select_authed ON public.inspection_notes
  FOR SELECT TO authenticated
  USING (
    (is_public = true AND slug IS NOT NULL AND length(btrim(slug)) > 0)
    OR (is_public = true AND published_at IS NOT NULL AND status = 'analyzed'::text)
    OR ((SELECT auth.uid()) = user_id)
    OR ((SELECT auth.email()) IS NOT NULL
      AND lower(btrim(author_email)) = lower(btrim((SELECT auth.email()))))
    OR is_admin()
    OR is_admin_request()
  );
CREATE POLICY inspection_notes_insert_authed ON public.inspection_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    ((SELECT auth.uid()) = user_id)
    OR ((SELECT auth.email()) IS NOT NULL
      AND lower(btrim(author_email)) = lower(btrim((SELECT auth.email()))))
    OR is_admin()
    OR is_admin_request()
  );
CREATE POLICY inspection_notes_update_authed ON public.inspection_notes
  FOR UPDATE TO authenticated
  USING (
    ((SELECT auth.uid()) = user_id)
    OR ((SELECT auth.email()) IS NOT NULL
      AND lower(btrim(author_email)) = lower(btrim((SELECT auth.email()))))
    OR is_admin()
    OR is_admin_request()
  )
  WITH CHECK (
    ((SELECT auth.uid()) = user_id)
    OR ((SELECT auth.email()) IS NOT NULL
      AND lower(btrim(author_email)) = lower(btrim((SELECT auth.email()))))
    OR is_admin()
    OR is_admin_request()
  );
CREATE POLICY inspection_notes_delete_authed ON public.inspection_notes
  FOR DELETE TO authenticated
  USING (
    ((SELECT auth.uid()) = user_id)
    OR ((SELECT auth.email()) IS NOT NULL
      AND lower(btrim(author_email)) = lower(btrim((SELECT auth.email()))))
    OR is_admin()
    OR is_admin_request()
  );
