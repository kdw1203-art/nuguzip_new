-- ============================================================
-- 2차 병합 긴급 교정 2 + 기존 정책 동반 수리 — 관리자 판별을 app_users 직접
-- EXISTS 에서 SECURITY DEFINER 헬퍼 is_admin_request() 로 교체.
--
-- 배경: 20260802094924 가 app_users 의 anon·authenticated GRANT 를 회수했다
-- (이메일·역할 표라 회수가 맞다). 그 뒤로 app_users 를 직접 참조하는 RLS
-- 정책은 해당 역할이 평가하는 순간 42501 로 쿼리 전체가 오류가 된다.
-- is_admin_request()(definer: email=auth.email() AND role='admin')는 호출
-- 역할의 GRANT 없이 동작하고 판별 의미는 동일하다.
-- 검증: anon·authenticated·관리자 클레임 3경로 실쿼리로 오류 없음 확인.
-- ============================================================

DROP POLICY IF EXISTS posts_select_authed ON public.posts;
DROP POLICY IF EXISTS posts_insert_authed ON public.posts;
DROP POLICY IF EXISTS posts_update_authed ON public.posts;
DROP POLICY IF EXISTS posts_delete_authed ON public.posts;
CREATE POLICY posts_select_authed ON public.posts
  FOR SELECT TO authenticated
  USING (COALESCE(visibility, 'public') IN ('public', 'link_only') OR is_admin_request());
CREATE POLICY posts_insert_authed ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (
    ((SELECT auth.email()) IS NOT NULL AND author_email IS NOT NULL
      AND lower(btrim(author_email)) = lower(btrim((SELECT auth.email()))))
    OR is_admin_request()
  );
CREATE POLICY posts_update_authed ON public.posts
  FOR UPDATE TO authenticated
  USING (
    ((SELECT auth.email()) IS NOT NULL AND author_email IS NOT NULL
      AND lower(btrim(author_email)) = lower(btrim((SELECT auth.email()))))
    OR is_admin_request()
  )
  WITH CHECK (
    (author_email IS NOT NULL
      AND lower(btrim(author_email)) = lower(btrim((SELECT auth.email()))))
    OR is_admin_request()
  );
CREATE POLICY posts_delete_authed ON public.posts
  FOR DELETE TO authenticated
  USING (
    ((SELECT auth.email()) IS NOT NULL AND author_email IS NOT NULL
      AND lower(btrim(author_email)) = lower(btrim((SELECT auth.email()))))
    OR is_admin_request()
  );

DROP POLICY IF EXISTS payments_select ON public.payments;
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    ((SELECT auth.email()) IS NOT NULL AND user_email IS NOT NULL
      AND lower(btrim(user_email)) = lower(btrim((SELECT auth.email()))))
    OR is_admin_request()
  );

DROP POLICY IF EXISTS report_purchases_select ON public.report_purchases;
DROP POLICY IF EXISTS report_purchases_admin_insert ON public.report_purchases;
DROP POLICY IF EXISTS report_purchases_admin_update ON public.report_purchases;
DROP POLICY IF EXISTS report_purchases_admin_delete ON public.report_purchases;
CREATE POLICY report_purchases_select ON public.report_purchases
  FOR SELECT TO authenticated
  USING (
    ((SELECT auth.email()) IS NOT NULL
      AND lower(btrim(user_email)) = lower(btrim((SELECT auth.email()))))
    OR is_admin_request()
  );
CREATE POLICY report_purchases_admin_insert ON public.report_purchases
  FOR INSERT TO authenticated WITH CHECK (is_admin_request());
CREATE POLICY report_purchases_admin_update ON public.report_purchases
  FOR UPDATE TO authenticated USING (is_admin_request()) WITH CHECK (is_admin_request());
CREATE POLICY report_purchases_admin_delete ON public.report_purchases
  FOR DELETE TO authenticated USING (is_admin_request());

DROP POLICY IF EXISTS reports_admin_insert ON public.reports;
DROP POLICY IF EXISTS reports_admin_update ON public.reports;
DROP POLICY IF EXISTS reports_admin_delete ON public.reports;
CREATE POLICY reports_admin_insert ON public.reports
  FOR INSERT TO authenticated WITH CHECK (is_admin_request());
CREATE POLICY reports_admin_update ON public.reports
  FOR UPDATE TO authenticated USING (is_admin_request()) WITH CHECK (is_admin_request());
CREATE POLICY reports_admin_delete ON public.reports
  FOR DELETE TO authenticated USING (is_admin_request());

DROP POLICY IF EXISTS uploads_select ON public.uploads;
DROP POLICY IF EXISTS uploads_insert ON public.uploads;
DROP POLICY IF EXISTS uploads_admin_update ON public.uploads;
DROP POLICY IF EXISTS uploads_admin_delete ON public.uploads;
CREATE POLICY uploads_select ON public.uploads
  FOR SELECT TO authenticated
  USING ((SELECT auth.email()) = uploader_email OR is_admin_request());
CREATE POLICY uploads_insert ON public.uploads
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.email()) = uploader_email OR is_admin_request());
CREATE POLICY uploads_admin_update ON public.uploads
  FOR UPDATE TO authenticated USING (is_admin_request()) WITH CHECK (is_admin_request());
CREATE POLICY uploads_admin_delete ON public.uploads
  FOR DELETE TO authenticated USING (is_admin_request());

-- chat_reports — SELECT 병합본 (definer 헬퍼는 원래 쓰던 형태)
DROP POLICY IF EXISTS chat_reports_select ON public.chat_reports;
CREATE POLICY chat_reports_select ON public.chat_reports
  FOR SELECT TO authenticated
  USING (
    lower(btrim(reporter_email)) = lower(btrim((SELECT auth.email())))
    OR is_admin_request()
  );

-- 기존(2차 이전) 정책 중 같은 문제를 가진 것들
DROP POLICY IF EXISTS inspection_notes_admin_all ON public.inspection_notes;
CREATE POLICY inspection_notes_admin_all ON public.inspection_notes
  FOR ALL TO authenticated USING (is_admin_request()) WITH CHECK (is_admin_request());
DROP POLICY IF EXISTS open_beta_tasks_insert_admin ON public.open_beta_tasks;
CREATE POLICY open_beta_tasks_insert_admin ON public.open_beta_tasks
  FOR INSERT TO authenticated WITH CHECK (is_admin_request());
DROP POLICY IF EXISTS open_beta_tasks_update_admin ON public.open_beta_tasks;
CREATE POLICY open_beta_tasks_update_admin ON public.open_beta_tasks
  FOR UPDATE TO authenticated USING (is_admin_request()) WITH CHECK (is_admin_request());
DROP POLICY IF EXISTS audit_admin_read ON public.audit_logs;
CREATE POLICY audit_admin_read ON public.audit_logs
  FOR SELECT TO authenticated USING (is_admin_request());
