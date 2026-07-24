/**
 * expert_consultations — 전문가 상담 요청/답변 스토어.
 * Supabase 미설정 시 인메모리 폴백.
 */
import { getServiceSupabase } from "@/lib/supabase/service";

export type ConsultStatus = "pending" | "replied" | "closed";
export type ConsultType = "text" | "call" | "visit";

export interface ExpertConsultation {
  id: string;
  expertId: string;
  expertLabel: string | null;
  userEmail: string;
  userName: string | null;
  type: ConsultType;
  message: string;
  contactInfo: string | null;
  preferredTime: string | null;
  status: ConsultStatus;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

function mapRow(r: Record<string, unknown>): ExpertConsultation {
  return {
    id: String(r.id ?? ""),
    expertId: String(r.expert_id ?? r.expertId ?? ""),
    expertLabel: r.expert_label ? String(r.expert_label) : null,
    // 실제 컬럼은 requester_email/requester_label — 구 코드 호환 위해 fallback 유지.
    userEmail: String(r.requester_email ?? r.user_email ?? r.userEmail ?? ""),
    userName: r.requester_label
      ? String(r.requester_label)
      : r.user_name
        ? String(r.user_name)
        : null,
    type: (r.consult_type as ConsultType) ?? "text",
    message: String(r.message ?? ""),
    contactInfo: r.contact_info ? String(r.contact_info) : null,
    preferredTime: r.preferred_time ? String(r.preferred_time) : null,
    status: (r.status as ConsultStatus) ?? "pending",
    reply: r.reply_message
      ? String(r.reply_message)
      : r.reply
        ? String(r.reply)
        : null,
    repliedAt: r.replied_at ? String(r.replied_at) : null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

const memory: ExpertConsultation[] = [];

export async function createConsultation(input: {
  expertId: string;
  expertLabel?: string | null;
  userEmail: string;
  userName?: string | null;
  type?: ConsultType;
  message: string;
  contactInfo?: string | null;
  preferredTime?: string | null;
}): Promise<ExpertConsultation> {
  const sb = getServiceSupabase();
  const item: ExpertConsultation = {
    id: crypto.randomUUID(),
    expertId: input.expertId,
    expertLabel: input.expertLabel ?? null,
    userEmail: input.userEmail,
    userName: input.userName ?? null,
    type: input.type ?? "text",
    message: input.message,
    contactInfo: input.contactInfo ?? null,
    preferredTime: input.preferredTime ?? null,
    status: "pending",
    reply: null,
    repliedAt: null,
    createdAt: new Date().toISOString(),
  };

  if (!sb) {
    memory.unshift(item);
    return item;
  }

  const { data, error } = await sb
    .from("expert_consultations")
    .insert({
      expert_id: item.expertId,
      requester_email: item.userEmail,
      requester_label: item.userName,
      consult_type: item.type,
      message: item.message,
      contact_info: item.contactInfo,
      preferred_time: item.preferredTime,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function listConsultationsForExpert(
  expertId: string,
): Promise<ExpertConsultation[]> {
  const sb = getServiceSupabase();
  if (!sb) return memory.filter((c) => c.expertId === expertId);

  const { data, error } = await sb
    .from("expert_consultations")
    .select("*")
    .eq("expert_id", expertId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function listMyConsultations(
  userEmail: string,
): Promise<ExpertConsultation[]> {
  const sb = getServiceSupabase();
  const normalised = userEmail.trim().toLowerCase();

  if (!sb) {
    return memory.filter((c) => c.userEmail.trim().toLowerCase() === normalised);
  }

  const { data, error } = await sb
    .from("expert_consultations")
    .select("*")
    .eq("requester_email", normalised)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/** 이번 달 상담 신청 횟수 (멤버십 한도용). */
export async function countConsultationsThisMonth(userEmail: string): Promise<number> {
  const em = userEmail.trim().toLowerCase();
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const since = start.toISOString();
  const sb = getServiceSupabase();
  if (!sb) {
    return memory.filter(
      (c) => c.userEmail.trim().toLowerCase() === em && c.createdAt >= since,
    ).length;
  }
  const { count } = await sb
    .from("expert_consultations")
    .select("id", { count: "exact", head: true })
    .eq("requester_email", em)
    .gte("created_at", since);
  return count ?? 0;
}

export async function replyConsultation(
  id: string,
  reply: string,
  expertId?: string,
): Promise<ExpertConsultation | null> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();

  if (!sb) {
    const idx = memory.findIndex(
      (c) => c.id === id && (!expertId || c.expertId === expertId),
    );
    if (idx === -1) return null;
    memory[idx] = { ...memory[idx], reply, repliedAt: now, status: "replied" };
    return memory[idx];
  }

  let q = sb
    .from("expert_consultations")
    .update({ reply_message: reply, replied_at: now, status: "replied" })
    .eq("id", id);
  // 상담이 해당 전문가 소유인지까지 스코프(다른 전문가 상담 답변 방지).
  if (expertId) q = q.eq("expert_id", expertId);
  const { data, error } = await q.select().single();

  if (error) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function closeConsultation(
  id: string,
): Promise<boolean> {
  const sb = getServiceSupabase();

  if (!sb) {
    const idx = memory.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    memory[idx] = { ...memory[idx], status: "closed" };
    return true;
  }

  const { error } = await sb
    .from("expert_consultations")
    .update({ status: "closed" })
    .eq("id", id);

  return !error;
}
