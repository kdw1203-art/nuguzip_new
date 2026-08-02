-- ============================================================
-- 항목 30 · 2차 — 중복 permissive 정책 병합 (어드바이저 WARN 19건 대응)
-- (원격 적용 완료 2026-08-02. 주의: 이 파일 단독으로는 불완전하다 —
--  직후의 20260802113441·20260802113611 두 교정과 한 세트다.)
--
-- 원칙: 가시성/권한 집합은 바꾸지 않는다. permissive 정책 여러 개는 OR
-- 합집합이므로 같은 (역할, 액션) 정책들을 qual OR 로 합쳐 하나로 만들고,
-- 관리자 ALL 정책은 쓰기 3종으로 분해해 SELECT 이중 평가를 없앤다.
-- 보류(의도): inspection_notes 의 uid·email 이원 정책 4종.
-- ============================================================

DROP POLICY IF EXISTS note_embeddings_select_own ON public.note_embeddings;

DROP POLICY IF EXISTS membership_plans_admin_write ON public.membership_plans;
CREATE POLICY membership_plans_admin_insert ON public.membership_plans
  FOR INSERT TO authenticated WITH CHECK (private.is_admin((SELECT auth.uid())));
CREATE POLICY membership_plans_admin_update ON public.membership_plans
  FOR UPDATE TO authenticated USING (private.is_admin((SELECT auth.uid())))
  WITH CHECK (private.is_admin((SELECT auth.uid())));
CREATE POLICY membership_plans_admin_delete ON public.membership_plans
  FOR DELETE TO authenticated USING (private.is_admin((SELECT auth.uid())));

-- reports·map_related_experts·posts·payments·chat_reports·report_purchases·
-- user_subscriptions·uploads·inspection_ai_reports 병합/분해 — 최종 형태는
-- 20260802113441(역할 분리)·20260802113611(관리자 판별 definer 헬퍼화)이
-- 확정하므로 여기서는 원본 정책 제거만 기록한다.
DROP POLICY IF EXISTS reports_admin_write ON public.reports;
DROP POLICY IF EXISTS map_related_experts_admin_write ON public.map_related_experts;
DROP POLICY IF EXISTS map_related_experts_select_active ON public.map_related_experts;
DROP POLICY IF EXISTS posts_admin_all ON public.posts;
DROP POLICY IF EXISTS posts_public_select ON public.posts;
DROP POLICY IF EXISTS posts_author_write ON public.posts;
DROP POLICY IF EXISTS posts_author_update ON public.posts;
DROP POLICY IF EXISTS posts_author_delete ON public.posts;
DROP POLICY IF EXISTS payments_admin_read ON public.payments;
DROP POLICY IF EXISTS payments_self_read ON public.payments;
DROP POLICY IF EXISTS chat_reports_admin_read ON public.chat_reports;
DROP POLICY IF EXISTS chat_reports_self_read ON public.chat_reports;
DROP POLICY IF EXISTS report_purchases_admin_all ON public.report_purchases;
DROP POLICY IF EXISTS report_purchases_self_read ON public.report_purchases;
DROP POLICY IF EXISTS "Admins can read subscriptions" ON public.user_subscriptions;
DROP POLICY IF EXISTS "Users can read own subscriptions" ON public.user_subscriptions;
CREATE POLICY user_subscriptions_select ON public.user_subscriptions
  FOR SELECT TO authenticated USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin', 'owner', 'operator'))
  );
DROP POLICY IF EXISTS uploads_admin_all ON public.uploads;
DROP POLICY IF EXISTS uploads_self_read ON public.uploads;
DROP POLICY IF EXISTS uploads_self_insert ON public.uploads;
DROP POLICY IF EXISTS inspection_ai_reports_select_owner_or_admin ON public.inspection_ai_reports;
DROP POLICY IF EXISTS inspection_ai_reports_select_public_note ON public.inspection_ai_reports;
CREATE POLICY inspection_ai_reports_select_anon ON public.inspection_ai_reports
  FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM inspection_notes
    WHERE inspection_notes.id = inspection_ai_reports.note_id
      AND inspection_notes.is_public = true
      AND inspection_notes.published_at IS NOT NULL
      AND inspection_notes.status = 'analyzed'));
CREATE POLICY inspection_ai_reports_select_authed ON public.inspection_ai_reports
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM inspection_notes
      WHERE inspection_notes.id = inspection_ai_reports.note_id
        AND inspection_notes.is_public = true
        AND inspection_notes.published_at IS NOT NULL
        AND inspection_notes.status = 'analyzed')
    OR is_inspection_note_owner(note_id) OR is_admin()
  );

-- get_app_stats — 유료 결제 건수 등 내부 집계 RPC. 코드 참조 0건(레거시).
-- 되돌림: GRANT EXECUTE ON FUNCTION public.get_app_stats() TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_app_stats() FROM public, anon, authenticated;
