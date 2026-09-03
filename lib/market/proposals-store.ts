/**
 * market_request_proposals — 견적 요청에 대한 전문가 제안 (953 영속화).
 *
 * 953 전에는 제안이 의뢰자 알림으로만 나가고 행이 남지 않았다(요청자는 알림함을
 * 놓치면 제안을 다시 볼 길이 없었고, 전문가는 자기가 어디에 제안했는지 몰랐다).
 * 이제 행으로 남기고 의뢰자 상담함(/my/consultations)에서 요청별로 모아 보여 준다.
 *
 * 공개 DTO 에 proposer_email 은 싣지 않는다 — 전문가 표시명(expert_label)과
 * 프로필 링크(expert_id)만.
 */
import { getServiceSupabase } from "@/lib/supabase/service";

export type ProposalStatus = "pending" | "accepted" | "declined";

export type MarketRequestProposal = {
  id: string;
  requestId: string;
  expertId: string | null;
  expertLabel: string;
  message: string;
  status: ProposalStatus;
  createdAt: string;
};

type MemoryRow = MarketRequestProposal & { proposerEmail: string };
const memory: MemoryRow[] = [];

function mapRow(r: Record<string, unknown>): MarketRequestProposal {
  const st = String(r.status ?? "pending");
  return {
    id: String(r.id ?? ""),
    requestId: String(r.request_id ?? ""),
    expertId: r.expert_id ? String(r.expert_id) : null,
    expertLabel: String(r.expert_label ?? "전문가"),
    message: String(r.message ?? ""),
    status: st === "accepted" || st === "declined" ? st : "pending",
    createdAt: String(r.created_at ?? ""),
  };
}

export type CreateProposalResult =
  | { ok: true; proposal: MarketRequestProposal }
  | { ok: false; code: "duplicate" | "unavailable"; message: string };

export async function createProposal(input: {
  requestId: string;
  proposerEmail: string;
  expertId: string;
  expertLabel: string;
  message: string;
}): Promise<CreateProposalResult> {
  const em = input.proposerEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    if (memory.some((p) => p.requestId === input.requestId && p.proposerEmail === em)) {
      return { ok: false, code: "duplicate", message: "이 요청에는 이미 제안을 보냈어요." };
    }
    const row: MemoryRow = {
      id: crypto.randomUUID(),
      requestId: input.requestId,
      expertId: input.expertId,
      expertLabel: input.expertLabel,
      message: input.message,
      status: "pending",
      createdAt: new Date().toISOString(),
      proposerEmail: em,
    };
    memory.unshift(row);
    const { proposerEmail: _e, ...pub } = row;
    return { ok: true, proposal: pub };
  }
  const { data, error } = await sb
    .from("market_request_proposals")
    .insert({
      request_id: input.requestId,
      proposer_email: em,
      expert_id: input.expertId,
      expert_label: input.expertLabel,
      message: input.message,
      status: "pending",
    })
    .select("id, request_id, expert_id, expert_label, message, status, created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, code: "duplicate", message: "이 요청에는 이미 제안을 보냈어요." };
    }
    return { ok: false, code: "unavailable", message: "제안을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true, proposal: mapRow(data as Record<string, unknown>) };
}

/** 여러 요청의 제안을 한 번에 — 의뢰자 상담함용. 결과는 requestId → 제안 목록(최신순). */
export async function listProposalsForRequests(
  requestIds: string[],
): Promise<Map<string, MarketRequestProposal[]>> {
  const out = new Map<string, MarketRequestProposal[]>();
  const ids = [...new Set(requestIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const sb = getServiceSupabase();
  const rows: MarketRequestProposal[] = sb
    ? await sb
        .from("market_request_proposals")
        .select("id, request_id, expert_id, expert_label, message, status, created_at")
        .in("request_id", ids)
        .order("created_at", { ascending: false })
        .limit(500)
        .then(({ data, error }) => (error ? [] : (data ?? []).map((r) => mapRow(r as Record<string, unknown>))))
    : memory.filter((p) => ids.includes(p.requestId));
  for (const p of rows) {
    const list = out.get(p.requestId) ?? [];
    list.push(p);
    out.set(p.requestId, list);
  }
  return out;
}

/** 전문가가 이미 제안한 요청 id 집합 — 전문가 콘솔에서 버튼 상태 */
export async function proposedRequestIds(proposerEmail: string): Promise<Set<string>> {
  const em = proposerEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) return new Set(memory.filter((p) => p.proposerEmail === em).map((p) => p.requestId));
  const { data, error } = await sb
    .from("market_request_proposals")
    .select("request_id")
    .eq("proposer_email", em)
    .limit(500);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => String((r as { request_id: unknown }).request_id)));
}

/** 요청별 제안 수 — 전문가 콘솔 보드에 "제안 N건" 표시 */
export async function countProposalsByRequest(requestIds: string[]): Promise<Map<string, number>> {
  const grouped = await listProposalsForRequests(requestIds);
  const out = new Map<string, number>();
  for (const [id, list] of grouped) out.set(id, list.length);
  return out;
}
