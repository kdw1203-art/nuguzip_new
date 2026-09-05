import { getServiceSupabase } from "@/lib/supabase/service";
import { resolveProfileRow, type AppUserProfile } from "@/lib/auth/profile-rules";

export type { AppUserProfile };

const FREE: AppUserProfile = { role: "user", plan: "free", banned: false };

export async function fetchAppUserByEmail(
  email: string,
): Promise<AppUserProfile> {
  const sb = getServiceSupabase();
  if (!sb) return FREE;
  const key = email.trim().toLowerCase();

  const { data, error } = await sb
    .from("app_users")
    .select("role, plan, plan_expires_at, is_banned, ban_until")
    .eq("email", key)
    .maybeSingle();

  if (error) {
    /* 컬럼이 덜 반영된 배포 — 최소 컬럼으로 재시도 */
    const { data: d2, error: e2 } = await sb
      .from("app_users")
      .select("role, plan")
      .eq("email", key)
      .maybeSingle();
    if (e2 || !d2) return FREE;
    return resolveProfileRow(d2 as { role?: string; plan?: string });
  }

  if (!data) return FREE;
  return resolveProfileRow(data as Parameters<typeof resolveProfileRow>[0]);
}
