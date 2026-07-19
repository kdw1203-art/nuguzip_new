import { getServiceSupabase } from "@/lib/supabase/service";

export type ExpertOpsSummary = {
  pendingVerifications: number;
  approvedExperts: number;
  consultationsOpen: number;
  consultationsAnswered7d: number;
  consultationsTotal30d: number;
  isDemo: boolean;
};

export async function loadExpertOpsSummary(): Promise<ExpertOpsSummary> {
  const sb = getServiceSupabase();
  if (!sb) {
    return {
      pendingVerifications: 0,
      approvedExperts: 0,
      consultationsOpen: 0,
      consultationsAnswered7d: 0,
      consultationsTotal30d: 0,
      isDemo: true,
    };
  }

  const since7d = new Date(Date.now() - 7 * 864e5).toISOString();
  const since30d = new Date(Date.now() - 30 * 864e5).toISOString();

  const [pendingRes, approvedRes, openRes, answeredRes, totalRes] = await Promise.all([
    sb
      .from("expert_verification_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    sb.from("experts").select("id", { count: "exact", head: true }).eq("is_verified", true),
    sb
      .from("expert_consultations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    sb
      .from("expert_consultations")
      .select("id", { count: "exact", head: true })
      .eq("status", "replied")
      .gte("replied_at", since7d),
    sb
      .from("expert_consultations")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since30d),
  ]);

  return {
    pendingVerifications: pendingRes.count ?? 0,
    approvedExperts: approvedRes.count ?? 0,
    consultationsOpen: openRes.count ?? 0,
    consultationsAnswered7d: answeredRes.count ?? 0,
    consultationsTotal30d: totalRes.count ?? 0,
    isDemo: false,
  };
}
