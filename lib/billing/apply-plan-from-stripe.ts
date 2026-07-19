import { normalizePlan, type AppPlan } from "@/lib/billing/plan";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export async function applyPlanToUserByEmail(
  email: string,
  plan: AppPlan,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const p = normalizePlan(plan);
  const { data, error } = await sb
    .from("app_users")
    .update({ plan: p })
    .eq("email", email.trim().toLowerCase())
    .select("id");
  if (error) {
    logger.error("[billing:apply-plan]", error.message);
    return false;
  }
  return Boolean(data?.length);
}
