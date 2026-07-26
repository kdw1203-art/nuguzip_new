import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* 2026-07-26: 이 파일의 로더들은 실패를 전부 삼키고 `[]`·`0` 을 돌려줬다.
   /admin/quality 머리말은 "모든 수치는 실 테이블 집계입니다" 라고 못 박고 있어서,
   조회 실패를 0 으로 채우면 그 문장이 그대로 거짓이 된다. 심사 대기 큐가 실패로
   비면 신청자가 무기한 방치되고, 이상행위 로그가 실패로 비면 "최근 감지된
   이상행위가 없어요" 라고 안심시킨다. 실패는 던져서 호출부가 구분하게 한다.
   (행이 0개인 것은 진짜 빈 상태이므로 그대로 `[]`.) */
function assertServiceClient(tag: string) {
  const sb = getServiceSupabase();
  if (!sb) {
    throw new Error(
      `[${tag}] Supabase 서비스 클라이언트를 만들 수 없습니다 (SUPABASE_SERVICE_ROLE_KEY 누락)`,
    );
  }
  return sb;
}

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

  /* 2026-07-26: `count ?? 0` 로 넘겼다. count 가 null 이 되는 건 행이 0개일 때가
     아니라 쿼리가 실패했을 때다 — 그런데 isDemo:false 를 같이 붙여서 "실집계 0건"
     이라고 단정했다. 실패한 집계는 0 이 아니므로 던지고, 호출부(admin/quality,
     admin/ops)는 이미 null 을 받으면 "—" 로 그린다. */
  const counts: Array<[string, { count: number | null; error: { message: string } | null }]> = [
    ["expert_verification_requests(pending)", pendingRes],
    ["expert_profiles(verified)", approvedRes],
    ["expert_consultations(pending)", openRes],
    ["expert_consultations(replied7d)", answeredRes],
    ["expert_consultations(total30d)", totalRes],
  ];
  for (const [tag, res] of counts) {
    if (res.error) {
      logger.error(`[expert-ops] ${tag} 집계 실패`, res.error.message);
      throw new Error(`${tag} 집계 실패: ${res.error.message}`);
    }
    if (typeof res.count !== "number") {
      throw new Error(`${tag} 집계 결과가 숫자가 아닙니다`);
    }
  }

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
  const sb = assertServiceClient("expert-ops/queue");
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

  /* 한쪽만 실패해도 던진다 — 전문가 신청만 읽히고 소유확인이 실패하면 "심사 대기
     2건" 처럼 절반이 빠진 수가 실집계인 것처럼 보인다. */
  if (expertRes.error) {
    logger.error("[expert-ops] 전문가 인증 신청 조회 실패", expertRes.error.message);
    throw new Error(`expert_verification_requests 조회 실패: ${expertRes.error.message}`);
  }
  if (ownerRes.error) {
    logger.error("[expert-ops] 소유확인 신청 조회 실패", ownerRes.error.message);
    throw new Error(`owner_verifications 조회 실패: ${ownerRes.error.message}`);
  }
  if (!Array.isArray(expertRes.data) || !Array.isArray(ownerRes.data)) {
    throw new Error("인증 심사 큐 응답이 배열이 아닙니다");
  }

  const experts: PendingVerificationItem[] = (
    expertRes.data as Record<string, unknown>[]
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
    ownerRes.data as Record<string, unknown>[]
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
  const sb = assertServiceClient("expert-ops/fraud");
  const { data, error } = await sb
    .from("expert_fraud_events")
    .select("id, user_email, event_type, severity, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  /* 실패를 `[]` 로 넘기면 "최근 감지된 이상행위가 없어요" 라고 안심시킨다.
     감시 화면에서 이건 가장 위험한 거짓말이라 던진다. */
  if (error) {
    logger.error("[expert-ops] 이상행위 로그 조회 실패", error.message);
    throw new Error(`expert_fraud_events 조회 실패: ${error.message}`);
  }
  if (!Array.isArray(data)) throw new Error("expert_fraud_events 응답이 배열이 아닙니다");
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
  const sb = assertServiceClient("expert-ops/perf");
  const [consultRes, profileRes] = await Promise.all([
    sb.from("expert_consultations").select("expert_id, status").limit(5000),
    sb.from("expert_profiles").select("id, name").limit(500),
  ]);
  /* 상담 조회가 실패하면 "집계할 상담 데이터가 아직 없어요" 로 그려졌다 —
     상담이 쌓여 있는데도 전문가 성과가 통째로 사라진다. 던진다.
     (프로필 조회 실패는 이름만 못 채우는 문제라 성과 수치를 죽이진 않는다.) */
  if (consultRes.error) {
    logger.error("[expert-ops] 전문가 상담 조회 실패", consultRes.error.message);
    throw new Error(`expert_consultations 조회 실패: ${consultRes.error.message}`);
  }
  if (profileRes.error) {
    logger.error("[expert-ops] 전문가 프로필 조회 실패", profileRes.error.message);
    throw new Error(`expert_profiles 조회 실패: ${profileRes.error.message}`);
  }
  if (!Array.isArray(consultRes.data)) throw new Error("expert_consultations 응답이 배열이 아닙니다");
  const consults = consultRes.data as { expert_id: string; status: string }[];
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
