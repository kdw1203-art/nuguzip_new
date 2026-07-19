import { fetchAppUserByEmail } from "@/lib/auth/fetch-app-user";
import { normalizePlanToGate, type PlanTier } from "@/lib/subscriptions/access-gate";
import { getServiceSupabase } from "@/lib/supabase/service";

export const AI_REPORT_LIMITS: Record<PlanTier, number | null> = {
  free: 3,
  pro: 20,
  expert: null,
  enterprise: null,
};

export async function getUserPlanTier(email: string): Promise<PlanTier> {
  const profile = await fetchAppUserByEmail(email);
  return normalizePlanToGate(profile.plan);
}

function currentYyyymm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function getMonthlyReportUsage(email: string): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb) return 0;
  const { data } = await sb
    .from("inspection_ai_usage")
    .select("report_count")
    .eq("author_email", email.trim().toLowerCase())
    .eq("yyyymm", currentYyyymm())
    .maybeSingle();
  return Number(data?.report_count ?? 0);
}

export async function checkReportQuota(email: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number | null;
  plan: PlanTier;
}> {
  const plan = await getUserPlanTier(email);
  const limit = AI_REPORT_LIMITS[plan];
  const used = await getMonthlyReportUsage(email);
  if (limit === null) return { allowed: true, used, limit, plan };
  return { allowed: used < limit, used, limit, plan };
}

export async function incrementReportUsage(email: string): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) return;
  const normalized = email.trim().toLowerCase();
  const yyyymm = currentYyyymm();
  const { data: existing } = await sb
    .from("inspection_ai_usage")
    .select("id, report_count")
    .eq("author_email", normalized)
    .eq("yyyymm", yyyymm)
    .maybeSingle();
  if (existing?.id) {
    await sb
      .from("inspection_ai_usage")
      .update({ report_count: Number(existing.report_count ?? 0) + 1 })
      .eq("id", existing.id);
  } else {
    await sb.from("inspection_ai_usage").insert({
      author_email: normalized,
      yyyymm,
      report_count: 1,
    });
  }
}
