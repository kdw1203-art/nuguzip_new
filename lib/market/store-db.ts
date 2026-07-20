/**
 * market_requests Supabase 백엔드.
 * Supabase 미설정 시 파일 기반 폴백.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  readMarketRequestsFile,
  prependMarketRequestFile,
  getMarketRequestFile,
} from "@/lib/market-store-file";
import type { MarketRequest, MarketRequestStatus } from "@/lib/types/market-request";

function mapRow(r: Record<string, unknown>): MarketRequest {
  return {
    id: String(r.id ?? ""),
    requestType: String(r.request_type ?? r.requestType ?? "자료요청"),
    city: String(r.city ?? "서울특별시"),
    district: String(r.district ?? ""),
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    budgetMin: r.budget_min != null ? Number(r.budget_min) : null,
    budgetMax: r.budget_max != null ? Number(r.budget_max) : null,
    dueDate: String(r.due_date ?? r.dueDate ?? ""),
    status: (r.status as MarketRequestStatus) === "closed" ? "closed" : "open",
    requesterLabel: String(r.requester_label ?? r.requesterLabel ?? "의뢰자"),
    relatedSite: r.related_site ? String(r.related_site) : undefined,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}

export async function listMarketRequests(): Promise<MarketRequest[]> {
  const sb = getServiceSupabase();
  if (!sb) return readMarketRequestsFile();
  const { data, error } = await sb
    .from("market_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return readMarketRequestsFile();
  return (data ?? []).map(mapRow);
}

export async function getMarketRequest(id: string): Promise<MarketRequest | null> {
  const sb = getServiceSupabase();
  if (!sb) return getMarketRequestFile(id);
  const { data, error } = await sb
    .from("market_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return getMarketRequestFile(id);
  return mapRow(data as Record<string, unknown>);
}

export async function createMarketRequest(input: {
  requesterEmail?: string;
  requesterLabel: string;
  title: string;
  description: string;
  requestType: string;
  city: string;
  district: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  dueDate?: string;
  relatedSite?: string;
}): Promise<MarketRequest> {
  const sb = getServiceSupabase();

  const payload = {
    requester_email: input.requesterEmail ?? "",
    requester_label: input.requesterLabel,
    title: input.title,
    description: input.description,
    request_type: input.requestType,
    city: input.city,
    district: input.district,
    budget_min: input.budgetMin ?? null,
    budget_max: input.budgetMax ?? null,
    due_date: input.dueDate ?? null,
    status: "open",
  };

  if (!sb) {
    const row: MarketRequest = {
      id: crypto.randomUUID(),
      requestType: input.requestType,
      city: input.city,
      district: input.district,
      title: input.title,
      description: input.description,
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      dueDate: input.dueDate ?? "",
      status: "open",
      requesterLabel: input.requesterLabel,
      relatedSite: input.relatedSite,
      createdAt: new Date().toISOString(),
    };
    await prependMarketRequestFile(row);
    return row;
  }

  const { data, error } = await sb
    .from("market_requests")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function closeMarketRequest(
  id: string,
): Promise<{ ok: boolean; message?: string }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, message: "Supabase 미설정" };
  const { error } = await sb
    .from("market_requests")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** 내 견적·자료 요청 목록 (requester_email 기준, 최신순) */
export async function listMyMarketRequests(email: string): Promise<MarketRequest[]> {
  if (!email) return [];
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("market_requests")
    .select("*")
    .eq("requester_email", email)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []).map(mapRow);
}
