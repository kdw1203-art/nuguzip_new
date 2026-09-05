import { normalizePlan, type AppPlan } from "@/lib/billing/plan";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export type ApplyPlanOptions = {
  /**
   * 일회성 결제(카카오페이·토스·포인트 교환)의 이용 기간(일).
   * 지정하면 만료 시각이 기록되고, 만료 후 크론(app/api/cron/plan-expiry-sweep)이
   * 무료 플랜으로 강등한다.
   *
   * 연장 규칙: 같은 플랜의 기존 만료 시각이 아직 미래면 **거기에** durationDays 를
   * 더한다(now 기준 덮어쓰기로 남은 이용 기간이 증발하던 문제의 수정). 만료가
   * 지났거나 없거나 다른 플랜으로 바뀌는 경우에는 now + durationDays.
   *
   * Stripe 구독 경로는 지정하지 않는다 — 갱신·해지를 웹훅이 관리하므로
   * 만료를 null 로 저장한다(스윕 대상에서 제외). 이전에 일회성 결제로 남은
   * 만료 시각이 있어도 구독 전환 시 null 로 덮어써 오강등을 막는다.
   */
  durationDays?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function applyPlanToUserByEmail(
  email: string,
  plan: AppPlan,
  options: ApplyPlanOptions = {},
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const p = normalizePlan(plan);
  const em = email.trim().toLowerCase();

  let expiresAt: string | null = null;
  if (p !== "free" && options.durationDays != null && options.durationDays > 0) {
    // 같은 플랜의 미래 만료 시각이 있으면 이어붙인다 (잔여 기간 보존).
    // 다른 플랜(업/다운그레이드)이나 만료 경과 시에는 지금부터 계산한다.
    let base = Date.now();
    const { data: current } = await sb
      .from("app_users")
      .select("plan, plan_expires_at")
      .eq("email", em)
      .maybeSingle();
    if (current?.plan_expires_at && normalizePlan(String(current.plan ?? "")) === p) {
      const existing = new Date(String(current.plan_expires_at)).getTime();
      if (Number.isFinite(existing) && existing > base) base = existing;
    }
    expiresAt = new Date(base + options.durationDays * DAY_MS).toISOString();
  }

  /* [966] updated_at 을 함께 적는다 — 만료 스윕이 "이용권 총 기간(만료-갱신)" 으로
     주간권(7일)을 가려내 T-7 알림을 건너뛰는 근거다. */
  const { data, error } = await sb
    .from("app_users")
    .update({ plan: p, plan_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("email", em)
    .select("id");
  if (error) {
    logger.error("[billing:apply-plan]", error.message);
    return false;
  }
  return Boolean(data?.length);
}
