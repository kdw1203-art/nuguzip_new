-- ============================================================
-- 2차 병합 긴급 교정 1 — 병합 정책의 관리자 분기(app_users EXISTS)가 anon
-- 평가 경로에 들어가면 42501(permission denied for app_users)로 쿼리 전체가
-- 오류가 된다(0행이 아니라 오류). app_users·profiles 참조 분기는
-- authenticated 전용 정책에만 두고, anon 은 공개 조건만 가진 별도 정책으로
-- 분리한다. 접근 집합은 병합 전과 동일.
-- (map_related_experts 도 is_admin() anon EXECUTE 여부에 기대지 않도록 분리.)
-- 최종 관리자 판별 형태는 다음 마이그레이션(20260802113611)이 확정한다.
-- ============================================================

CREATE POLICY posts_select_anon ON public.posts
  FOR SELECT TO anon
  USING (COALESCE(visibility, 'public') IN ('public', 'link_only'));

DROP POLICY IF EXISTS map_related_experts_select ON public.map_related_experts;
CREATE POLICY map_related_experts_select_anon ON public.map_related_experts
  FOR SELECT TO anon USING (is_active = true);
CREATE POLICY map_related_experts_select_authed ON public.map_related_experts
  FOR SELECT TO authenticated USING (is_active = true OR is_admin());
