import { normalizePlan, type AppPlan } from "@/lib/billing/plan";
import type { UserRole } from "@/lib/auth/types";
import { getServiceSupabase } from "@/lib/supabase/service";

export type AppUserProfile = { role: UserRole; plan: AppPlan };

export async function fetchAppUserByEmail(
  email: string,
): Promise<AppUserProfile> {
  const sb = getServiceSupabase();
  if (!sb) return { role: "user", plan: "free" };

  const { data, error } = await sb
    .from("app_users")
    .select("role, plan")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    const { data: d2, error: e2 } = await sb
      .from("app_users")
      .select("role")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();
    if (e2 || !d2) return { role: "user", plan: "free" };
    const r = d2.role as string | undefined;
    return { role: r === "admin" ? "admin" : "user", plan: "free" };
  }

  if (!data) return { role: "user", plan: "free" };
  const r = data.role as string | undefined;
  return {
    role: r === "admin" ? "admin" : "user",
    plan: normalizePlan(data.plan as string | undefined),
  };
}
