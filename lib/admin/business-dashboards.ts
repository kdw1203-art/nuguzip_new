/**
 * 관리자 비즈니스 대시보드 5종 데이터 레이어 — 마이그레이션 038 의 테이블/뷰 사용.
 *
 * Supabase 미설정 시 빈 배열/0을 반환하여 UI 가 "데이터 없음" 카드로 동작.
 * 모든 함수는 service role 키로만 호출되므로 RLS 가드(is_admin_request) 와는 별개로
 * 라우트에서 호출 전에 admin 세션 검증이 선행되어야 합니다.
 */

import { getServiceSupabase } from "@/lib/supabase/service";

// ============================================================
// 공통 타입
// ============================================================
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ============================================================
// 1) 투자 제안 (IR Documents)
// ============================================================
export type IrDocument = {
  id: string;
  version: string;
  title: string;
  summaryMd: string;
  filePath: string | null;
  isPublished: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IrInvestorAccess = {
  id: string;
  email: string;
  role: "viewer" | "editor";
  grantedBy: string | null;
  grantedAt: string;
};

export type IrDownloadLog = {
  id: string;
  documentId: string | null;
  accessedBy: string | null;
  accessedAt: string;
  ipHash: string | null;
};

export async function listIrDocuments(): Promise<IrDocument[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("ir_documents")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    version: String(r.version ?? ""),
    title: String(r.title ?? ""),
    summaryMd: String(r.summary_md ?? ""),
    filePath: r.file_path ? String(r.file_path) : null,
    isPublished: Boolean(r.is_published),
    createdBy: r.created_by ? String(r.created_by) : null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }));
}

export async function createIrDocument(input: {
  version: string;
  title: string;
  summaryMd?: string;
  filePath?: string | null;
  isPublished?: boolean;
  createdBy?: string;
}): Promise<IrDocument | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("ir_documents")
    .insert({
      version: input.version,
      title: input.title,
      summary_md: input.summaryMd ?? "",
      file_path: input.filePath ?? null,
      is_published: input.isPublished ?? false,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single();
  if (error || !data) return null;
  return (await listIrDocuments()).find((d) => d.id === String((data as Record<string, unknown>).id)) ?? null;
}

export async function updateIrDocument(
  id: string,
  input: Partial<Omit<IrDocument, "id" | "createdAt" | "createdBy">>,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb
    .from("ir_documents")
    .update({
      ...(input.version !== undefined ? { version: input.version } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.summaryMd !== undefined ? { summary_md: input.summaryMd } : {}),
      ...(input.filePath !== undefined ? { file_path: input.filePath } : {}),
      ...(input.isPublished !== undefined ? { is_published: input.isPublished } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return !error;
}

export async function deleteIrDocument(id: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("ir_documents").delete().eq("id", id);
  return !error;
}

export async function listIrInvestorAccess(): Promise<IrInvestorAccess[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb.from("ir_investor_access").select("*").order("granted_at", { ascending: false });
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    email: String(r.email ?? ""),
    role: (r.role === "editor" ? "editor" : "viewer") as "editor" | "viewer",
    grantedBy: r.granted_by ? String(r.granted_by) : null,
    grantedAt: String(r.granted_at ?? new Date().toISOString()),
  }));
}

export async function grantIrInvestorAccess(input: {
  email: string;
  role?: "viewer" | "editor";
  grantedBy?: string;
}): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("ir_investor_access").upsert(
    {
      email: input.email,
      role: input.role ?? "viewer",
      granted_by: input.grantedBy ?? null,
    },
    { onConflict: "email" },
  );
  return !error;
}

export async function revokeIrInvestorAccess(email: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("ir_investor_access").delete().eq("email", email);
  return !error;
}

export async function listIrDownloadsLog(limit = 50): Promise<IrDownloadLog[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("ir_downloads_log")
    .select("*")
    .order("accessed_at", { ascending: false })
    .limit(limit);
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    documentId: r.document_id ? String(r.document_id) : null,
    accessedBy: r.accessed_by ? String(r.accessed_by) : null,
    accessedAt: String(r.accessed_at ?? new Date().toISOString()),
    ipHash: r.ip_hash ? String(r.ip_hash) : null,
  }));
}

// ============================================================
// 2) 비즈니스 (Partners + Inquiries)
// ============================================================
export type PartnerType = "corporate" | "agency" | "media" | "gov" | "other";
export type PartnerStatus = "lead" | "negotiation" | "signed" | "paused" | "churned";

export type BusinessPartner = {
  id: string;
  name: string;
  partnerType: PartnerType;
  contact: string | null;
  contractStatus: PartnerStatus;
  dealSizeKrw: number;
  ownerEmail: string | null;
  notesMd: string;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type B2bInquiryStatus = "open" | "in_progress" | "won" | "lost";

export type B2bInquiry = {
  id: string;
  partnerId: string | null;
  title: string;
  bodyMd: string;
  status: B2bInquiryStatus;
  dueAt: string | null;
  createdAt: string;
};

export async function listBusinessPartners(): Promise<BusinessPartner[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb.from("business_partners").select("*").order("created_at", { ascending: false });
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    partnerType: (r.partner_type ?? "corporate") as PartnerType,
    contact: r.contact ? String(r.contact) : null,
    contractStatus: (r.contract_status ?? "lead") as PartnerStatus,
    dealSizeKrw: Number(r.deal_size_krw ?? 0),
    ownerEmail: r.owner_email ? String(r.owner_email) : null,
    notesMd: String(r.notes_md ?? ""),
    lastContactedAt: r.last_contacted_at ? String(r.last_contacted_at) : null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }));
}

export async function createBusinessPartner(input: {
  name: string;
  partnerType?: PartnerType;
  contact?: string | null;
  contractStatus?: PartnerStatus;
  dealSizeKrw?: number;
  ownerEmail?: string | null;
  notesMd?: string;
}): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("business_partners").insert({
    name: input.name,
    partner_type: input.partnerType ?? "corporate",
    contact: input.contact ?? null,
    contract_status: input.contractStatus ?? "lead",
    deal_size_krw: input.dealSizeKrw ?? 0,
    owner_email: input.ownerEmail ?? null,
    notes_md: input.notesMd ?? "",
  });
  return !error;
}

export async function updateBusinessPartner(
  id: string,
  input: Partial<Omit<BusinessPartner, "id" | "createdAt" | "updatedAt">>,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb
    .from("business_partners")
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.partnerType !== undefined ? { partner_type: input.partnerType } : {}),
      ...(input.contact !== undefined ? { contact: input.contact } : {}),
      ...(input.contractStatus !== undefined ? { contract_status: input.contractStatus } : {}),
      ...(input.dealSizeKrw !== undefined ? { deal_size_krw: input.dealSizeKrw } : {}),
      ...(input.ownerEmail !== undefined ? { owner_email: input.ownerEmail } : {}),
      ...(input.notesMd !== undefined ? { notes_md: input.notesMd } : {}),
      ...(input.lastContactedAt !== undefined ? { last_contacted_at: input.lastContactedAt } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return !error;
}

export async function deleteBusinessPartner(id: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("business_partners").delete().eq("id", id);
  return !error;
}

export async function listB2bInquiries(): Promise<B2bInquiry[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb.from("b2b_inquiries").select("*").order("created_at", { ascending: false });
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    partnerId: r.partner_id ? String(r.partner_id) : null,
    title: String(r.title ?? ""),
    bodyMd: String(r.body_md ?? ""),
    status: (r.status ?? "open") as B2bInquiryStatus,
    dueAt: r.due_at ? String(r.due_at) : null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }));
}

export async function createB2bInquiry(input: {
  partnerId?: string | null;
  title: string;
  bodyMd?: string;
  status?: B2bInquiryStatus;
  dueAt?: string | null;
}): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("b2b_inquiries").insert({
    partner_id: input.partnerId ?? null,
    title: input.title,
    body_md: input.bodyMd ?? "",
    status: input.status ?? "open",
    due_at: input.dueAt ?? null,
  });
  return !error;
}

export async function updateB2bInquiry(
  id: string,
  input: Partial<Omit<B2bInquiry, "id" | "createdAt">>,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb
    .from("b2b_inquiries")
    .update({
      ...(input.partnerId !== undefined ? { partner_id: input.partnerId } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.bodyMd !== undefined ? { body_md: input.bodyMd } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.dueAt !== undefined ? { due_at: input.dueAt } : {}),
    })
    .eq("id", id);
  return !error;
}

export async function deleteB2bInquiry(id: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("b2b_inquiries").delete().eq("id", id);
  return !error;
}

// ============================================================
// 3) 성장 로드맵 (OKR + Milestones)
// ============================================================
export type OkrObjective = {
  id: string;
  quarter: string;
  title: string;
  ownerEmail: string | null;
  description: string;
  createdAt: string;
};

export type OkrKeyResult = {
  id: string;
  objectiveId: string;
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  updatedAt: string;
};

export type RoadmapStatus = "planned" | "in_progress" | "launched" | "cancelled";

export type RoadmapMilestone = {
  id: string;
  quarter: string;
  title: string;
  status: RoadmapStatus;
  launchedAt: string | null;
  retroMd: string;
  createdAt: string;
};

export async function listOkrObjectives(quarter?: string): Promise<OkrObjective[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  let q = sb.from("okr_objectives").select("*");
  if (quarter) q = q.eq("quarter", quarter);
  const { data } = await q.order("created_at", { ascending: false });
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    quarter: String(r.quarter ?? ""),
    title: String(r.title ?? ""),
    ownerEmail: r.owner_email ? String(r.owner_email) : null,
    description: String(r.description ?? ""),
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }));
}

export async function createOkrObjective(input: {
  quarter: string;
  title: string;
  ownerEmail?: string;
  description?: string;
}): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("okr_objectives").insert({
    quarter: input.quarter,
    title: input.title,
    owner_email: input.ownerEmail ?? null,
    description: input.description ?? "",
  });
  return !error;
}

export async function deleteOkrObjective(id: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("okr_objectives").delete().eq("id", id);
  return !error;
}

export async function listOkrKeyResults(objectiveIds: string[]): Promise<OkrKeyResult[]> {
  const sb = getServiceSupabase();
  if (!sb || !objectiveIds.length) return [];
  const { data } = await sb
    .from("okr_key_results")
    .select("*")
    .in("objective_id", objectiveIds);
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    objectiveId: String(r.objective_id),
    title: String(r.title ?? ""),
    targetValue: Number(r.target_value ?? 100),
    currentValue: Number(r.current_value ?? 0),
    unit: String(r.unit ?? ""),
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }));
}

export async function createOkrKeyResult(input: {
  objectiveId: string;
  title: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
}): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("okr_key_results").insert({
    objective_id: input.objectiveId,
    title: input.title,
    target_value: input.targetValue ?? 100,
    current_value: input.currentValue ?? 0,
    unit: input.unit ?? "",
  });
  return !error;
}

export async function updateOkrKeyResult(
  id: string,
  input: Partial<Omit<OkrKeyResult, "id" | "objectiveId" | "updatedAt">>,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb
    .from("okr_key_results")
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.targetValue !== undefined ? { target_value: input.targetValue } : {}),
      ...(input.currentValue !== undefined ? { current_value: input.currentValue } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return !error;
}

export async function deleteOkrKeyResult(id: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("okr_key_results").delete().eq("id", id);
  return !error;
}

export async function listRoadmapMilestones(quarter?: string): Promise<RoadmapMilestone[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  let q = sb.from("roadmap_milestones").select("*");
  if (quarter) q = q.eq("quarter", quarter);
  const { data } = await q.order("created_at", { ascending: false });
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    quarter: String(r.quarter ?? ""),
    title: String(r.title ?? ""),
    status: (r.status ?? "planned") as RoadmapStatus,
    launchedAt: r.launched_at ? String(r.launched_at) : null,
    retroMd: String(r.retro_md ?? ""),
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }));
}

export async function createRoadmapMilestone(input: {
  quarter: string;
  title: string;
  status?: RoadmapStatus;
  launchedAt?: string | null;
  retroMd?: string;
}): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("roadmap_milestones").insert({
    quarter: input.quarter,
    title: input.title,
    status: input.status ?? "planned",
    launched_at: input.launchedAt ?? null,
    retro_md: input.retroMd ?? "",
  });
  return !error;
}

export async function updateRoadmapMilestone(
  id: string,
  input: Partial<Omit<RoadmapMilestone, "id" | "createdAt">>,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb
    .from("roadmap_milestones")
    .update({
      ...(input.quarter !== undefined ? { quarter: input.quarter } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.launchedAt !== undefined ? { launched_at: input.launchedAt } : {}),
      ...(input.retroMd !== undefined ? { retro_md: input.retroMd } : {}),
    })
    .eq("id", id);
  return !error;
}

export async function deleteRoadmapMilestone(id: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("roadmap_milestones").delete().eq("id", id);
  return !error;
}

// ============================================================
// 4) 재무 계획 (Entries + Cash Balance)
// ============================================================
export type FinanceKind = "revenue" | "expense";

export type FinanceEntry = {
  id: string;
  month: string;
  kind: FinanceKind;
  category: string;
  amountKrw: number;
  memo: string;
  createdBy: string | null;
  createdAt: string;
};

export type FinanceCashBalance = {
  month: string;
  balanceKrw: number;
  updatedAt: string;
};

export async function listFinanceEntries(monthFilter?: string): Promise<FinanceEntry[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  let q = sb.from("finance_entries").select("*");
  if (monthFilter) q = q.eq("month", monthFilter);
  const { data } = await q.order("created_at", { ascending: false });
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    month: String(r.month ?? ""),
    kind: (r.kind ?? "revenue") as FinanceKind,
    category: String(r.category ?? "general"),
    amountKrw: Number(r.amount_krw ?? 0),
    memo: String(r.memo ?? ""),
    createdBy: r.created_by ? String(r.created_by) : null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }));
}

export async function createFinanceEntry(input: {
  month: string;
  kind: FinanceKind;
  category?: string;
  amountKrw: number;
  memo?: string;
  createdBy?: string;
}): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("finance_entries").insert({
    month: input.month,
    kind: input.kind,
    category: input.category ?? "general",
    amount_krw: input.amountKrw,
    memo: input.memo ?? "",
    created_by: input.createdBy ?? null,
  });
  return !error;
}

export async function deleteFinanceEntry(id: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("finance_entries").delete().eq("id", id);
  return !error;
}

export async function listFinanceCashBalance(): Promise<FinanceCashBalance[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data } = await sb.from("finance_cash_balance").select("*").order("month", { ascending: false });
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    month: String(r.month ?? ""),
    balanceKrw: Number(r.balance_krw ?? 0),
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }));
}

export async function upsertFinanceCashBalance(input: {
  month: string;
  balanceKrw: number;
}): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { error } = await sb.from("finance_cash_balance").upsert(
    {
      month: input.month,
      balance_krw: input.balanceKrw,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "month" },
  );
  return !error;
}

/** 월별 수익·비용·순익을 합산해서 반환 (최근 12개월) */
export async function aggregateFinanceMonths(): Promise<
  Array<{ month: string; revenue: number; expense: number; net: number }>
> {
  const entries = await listFinanceEntries();
  const map = new Map<string, { revenue: number; expense: number }>();
  for (const e of entries) {
    const cur = map.get(e.month) ?? { revenue: 0, expense: 0 };
    if (e.kind === "revenue") cur.revenue += e.amountKrw;
    else cur.expense += e.amountKrw;
    map.set(e.month, cur);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12)
    .map(([month, v]) => ({ month, revenue: v.revenue, expense: v.expense, net: v.revenue - v.expense }));
}

// ============================================================
// 5) 유저 유입 (admin_acquisition_signups view)
// ============================================================
export type AcquisitionRow = {
  day: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  referrer: string;
  signups: number;
};

export async function listAcquisitionSignups(daysBack = 30): Promise<AcquisitionRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const sinceIso = new Date(Date.now() - daysBack * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("admin_acquisition_signups")
    .select("*")
    .gte("day", sinceIso)
    .order("day", { ascending: false });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    day: String(r.day ?? ""),
    utmSource: String(r.utm_source ?? "direct"),
    utmMedium: String(r.utm_medium ?? ""),
    utmCampaign: String(r.utm_campaign ?? ""),
    referrer: String(r.referrer ?? ""),
    signups: Number(r.signups ?? 0),
  }));
}
