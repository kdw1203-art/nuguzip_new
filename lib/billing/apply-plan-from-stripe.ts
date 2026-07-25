import { normalizePlan, type AppPlan } from "@/lib/billing/plan";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export type ApplyPlanOptions = {
  /**
   * 일회성 결제(카카오페이·토스·포인트 교환)의 이용 기간(일).
   * 지정하면 `plan_expires_at = now() + durationDays` 로 기록되고,
   * 만료 후 크론(app/api/cron/plan-expiry-sweep)이 무료 플랜으로 강등한다.
   *
   * Stripe 구독 경로는 지정하지 않는다 — 갱신·해지를 웹훅이 관리하므로
   * 만료를 null 로 저장한다(스윕 대상에서 제외). 이전에 일회성 결제로 남은
   * 만료 시각이 있어도 구독 전환 시 null 로 덮어써 오강등을 막는다.
   */
  durationDays?: number;
};

export async function applyPlanToUserByEmail(
  email: string,
  plan: AppPlan,
  options: ApplyPlanOptions = {},
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const p = normalizePlan(plan);
  const expiresAt =
    p !== "free" && options.durationDays != null && options.durationDays > 0
      ? new Date(Date.now() + options.durationDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
  const { data, error } = await sb
    .from("app_users")
    .update({ plan: p, plan_expires_at: expiresAt })
    .eq("email", email.trim().toLowerCase())
    .select("id");
  if (error) {
    logger.error("[billing:apply-plan]", error.message);
    return false;
  }
  return Boolean(data?.length);
}
