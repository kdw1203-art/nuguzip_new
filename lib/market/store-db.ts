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

/**
 * 의뢰 마감. 소유자(requester_email) 또는 관리자만.
 *
 * 예전에는 id 만 받아 service-role 로 상태를 바꿨다. 같은 라우트의 PATCH·DELETE 는
 * requester_email 로 좁히는데 마감 분기만 그 조건이 빠져 있어서, 로그인한 아무나
 * `{"status":"closed"}` 하나로 남의 의뢰를 닫을 수 있었다.
 * `email` 은 호출자의 이메일, `isAdmin` 이면 소유자 조건을 걸지 않는다.
 */
export async function closeMarketRequest(
  id: string,
  actor: { email: string; isAdmin?: boolean },
): Promise<{ ok: boolean; forbidden?: boolean; message?: string }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, message: "Supabase 미설정" };
  const query = sb
    .from("market_requests")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (!actor.isAdmin) query.eq("requester_email", actor.email);
  /* select 로 실제 갱신된 행을 확인한다 — 소유자 조건에 걸려 0행이 바뀌어도 update 는
     error 를 내지 않으므로, 그냥 ok:true 를 돌려주면 "닫혔다"고 거짓 보고를 하게 된다. */
  const { data, error } = await query.select("id");
  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) {
    return { ok: false, forbidden: true, message: "권한이 없습니다." };
  }
  return { ok: true };
}

/**
 * 견적 요청의 소유자 이메일·상태만 — 전문가 '제안 보내기' 알림 발송 전용(서버).
 * mapRow 는 공개 응답에 실리므로 requester_email 을 일부러 싣지 않는다 — 알림
 * 발송처럼 이메일이 꼭 필요한 서버 경로만 이 헬퍼로 좁혀 읽는다.
 */
export async function getMarketRequestOwnerEmail(
  id: string,
): Promise<{ email: string; status: string } | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("market_requests")
    .select("requester_email, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const email = String((data as { requester_email?: unknown }).requester_email ?? "").trim();
  if (!email) return null;
  return { email, status: String((data as { status?: unknown }).status ?? "open") };
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
