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
    sb
      .from("expert_profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_verified", true),
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

export type PendingVerificationItem = {
  id: string;
  kind: "expert" | "owner";
  label: string;
  sub: string;
  createdAt: string | null;
};

/**
 * 실데이터 인증 심사 대기열 — 전문가 인증 신청(expert_verification_requests)과
 * 소유주/중개 매물 소유확인(owner_verifications)의 pending 건을 최신순으로.
 * 사실 우선: 목업 신청자 없이 실제 신청만. env·권한 없으면 빈 배열.
 */
export async function loadPendingVerificationQueue(
  limit = 12,
): Promise<PendingVerificationItem[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const [expertRes, ownerRes] = await Promise.all([
    sb
      .from("expert_verification_requests")
      .select("id, display_name, applicant_email, specialty, regions, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit),
    sb
      .from("owner_verifications")
      .select("id, complex_name, region, property_address, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const experts: PendingVerificationItem[] = (
    (expertRes.data as Record<string, unknown>[] | null) ?? []
  ).map((r) => {
    const regions = Array.isArray(r.regions) ? (r.regions as string[]) : [];
    return {
      id: String(r.id),
      kind: "expert" as const,
      label: String(r.display_name || r.applicant_email || "전문가 신청"),
      sub: [r.specialty, regions.join("·")].filter(Boolean).join(" · ") || "전문가 인증",
      createdAt: (r.created_at as string | null) ?? null,
    };
  });

  const owners: PendingVerificationItem[] = (
    (ownerRes.data as Record<string, unknown>[] | null) ?? []
  ).map((r) => ({
    id: String(r.id),
    kind: "owner" as const,
    label: String(r.complex_name || r.property_address || "매물 소유확인"),
    sub: [r.region, "소유확인"].filter(Boolean).join(" · "),
    createdAt: (r.created_at as string | null) ?? null,
  }));

  return [...experts, ...owners]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, limit);
}

/* ---------------- J8 전문가 이상행위 로그 ---------------- */

export type FraudEventItem = {
  id: string;
  userEmail: string;
  eventType: string;
  severity: string;
  createdAt: string | null;
};

/** 최근 전문가 이상행위 로그(expert_fraud_events) — 관리자 모니터. 없으면 빈 배열. */
export async function loadRecentFraudEvents(limit = 15): Promise<FraudEventItem[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("expert_fraud_events")
    .select("id, user_email, event_type, severity, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !Array.isArray(data)) return [];
  return data.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      userEmail: String(row.user_email ?? ""),
      eventType: String(row.event_type ?? ""),
      severity: String(row.severity ?? "warn"),
      createdAt: (row.created_at as string | null) ?? null,
    };
  });
}

/* ---------------- J7 전문가 성과 랭킹 ---------------- */

export type ExpertPerfItem = {
  expertId: string;
  name: string;
  total: number;
  replied: number;
  replyRate: number; // 0~100
};

/** 전문가 성과 랭킹 — 상담 수·답변율(expert_consultations + expert_profiles). 없으면 빈 배열. */
export async function loadExpertPerformance(limit = 10): Promise<ExpertPerfItem[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const [consultRes, profileRes] = await Promise.all([
    sb.from("expert_consultations").select("expert_id, status").limit(5000),
    sb.from("expert_profiles").select("id, name").limit(500),
  ]);
  const consults = (consultRes.data as { expert_id: string; status: string }[] | null) ?? [];
  if (consults.length === 0) return [];
  const names = new Map<string, string>();
  for (const p of (profileRes.data as { id: string; name: string }[] | null) ?? []) {
    names.set(String(p.id), String(p.name));
  }
  const agg = new Map<string, { total: number; replied: number }>();
  for (const c of consults) {
    const id = String(c.expert_id ?? "");
    if (!id) continue;
    const cur = agg.get(id) ?? { total: 0, replied: 0 };
    cur.total += 1;
    if (c.status === "replied" || c.status === "closed") cur.replied += 1;
    agg.set(id, cur);
  }
  return [...agg.entries()]
    .map(([expertId, v]) => ({
      expertId,
      name: names.get(expertId) ?? "전문가",
      total: v.total,
      replied: v.replied,
      replyRate: v.total > 0 ? Math.round((v.replied / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
