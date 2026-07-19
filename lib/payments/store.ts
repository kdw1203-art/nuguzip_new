import { getServiceSupabase } from "@/lib/supabase/service";
import type { PlanTier } from "@/components/ui-kit";

export type PaymentStatus =
  | "requested"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded";

export type PaymentRecord = {
  id: string;
  orderId: string;
  userEmail: string | null;
  plan: PlanTier;
  billing: "monthly" | "annual";
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  providerPaymentKey?: string | null;
  method?: string | null;
  receiptUrl?: string | null;
  requestedAt: string;
  paidAt?: string | null;
  failedAt?: string | null;
  cancelledAt?: string | null;
};

/**
 * Supabase 미설정 시 사용하는 메모리 fallback.
 * 프로세스 내에서만 유지되며 재시작 시 초기화됩니다.
 */
const memory: PaymentRecord[] = [];

export async function createPayment(input: {
  orderId: string;
  userEmail: string | null;
  plan: PlanTier;
  billing: "monthly" | "annual";
  amount: number;
  metadata?: Record<string, unknown>;
  /** 결제 제공자(기본 'toss'). 토스페이(apps-in-toss)는 'tosspay'. */
  provider?: string;
  /** 생성 시점에 제공자 토큰(예: 토스페이 payToken)을 함께 저장. */
  providerPaymentKey?: string | null;
}): Promise<PaymentRecord> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  const provider = input.provider ?? "toss";
  const rec: PaymentRecord = {
    id: `mem-${input.orderId}`,
    orderId: input.orderId,
    userEmail: input.userEmail,
    plan: input.plan,
    billing: input.billing,
    amount: input.amount,
    currency: "KRW",
    status: "requested",
    provider,
    providerPaymentKey: input.providerPaymentKey ?? null,
    requestedAt: now,
  };
  if (!sb) {
    memory.unshift(rec);
    return rec;
  }
  const { error, data } = await sb
    .from("payments")
    .insert({
      order_id: input.orderId,
      user_email: input.userEmail,
      plan: input.plan,
      billing: input.billing,
      amount: input.amount,
      metadata: input.metadata ?? {},
      provider,
      ...(input.providerPaymentKey
        ? { provider_payment_key: input.providerPaymentKey }
        : {}),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

export async function findRecentRequestedPayment(input: {
  userEmail: string | null;
  plan: PlanTier;
  billing: "monthly" | "annual";
  amount: number;
  withinMinutes?: number;
}): Promise<PaymentRecord | null> {
  const withinMinutes = Math.max(1, input.withinMinutes ?? 10);
  const cutoffMs = Date.now() - withinMinutes * 60_000;
  const sb = getServiceSupabase();
  if (!sb) {
    return (
      memory.find((x) => {
        if (x.status !== "requested") return false;
        if ((x.userEmail ?? null) !== (input.userEmail ?? null)) return false;
        if (x.plan !== input.plan || x.billing !== input.billing) return false;
        if (Number(x.amount) !== Number(input.amount)) return false;
        const ts = new Date(x.requestedAt).getTime();
        return Number.isFinite(ts) && ts >= cutoffMs;
      }) ?? null
    );
  }
  let q = sb
    .from("payments")
    .select("*")
    .eq("status", "requested")
    .eq("plan", input.plan)
    .eq("billing", input.billing)
    .eq("amount", input.amount)
    .order("requested_at", { ascending: false })
    .limit(1);
  if (input.userEmail) {
    q = q.eq("user_email", input.userEmail);
  } else {
    q = q.is("user_email", null);
  }
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  const rec = mapRow(data);
  const ts = new Date(rec.requestedAt).getTime();
  if (!Number.isFinite(ts) || ts < cutoffMs) return null;
  return rec;
}

export async function setPaymentProviderKey(input: {
  orderId: string;
  providerPaymentKey: string;
}): Promise<PaymentRecord | null> {
  const sb = getServiceSupabase();
  if (!sb) {
    const r = memory.find((x) => x.orderId === input.orderId);
    if (!r) return null;
    r.providerPaymentKey = input.providerPaymentKey;
    return r;
  }
  const { data, error } = await sb
    .from("payments")
    .update({ provider_payment_key: input.providerPaymentKey })
    .eq("order_id", input.orderId)
    .select()
    .single();
  if (error) return null;
  return mapRow(data);
}

export async function markPaid(input: {
  orderId: string;
  providerPaymentKey?: string;
  method?: string;
  receiptUrl?: string;
}): Promise<PaymentRecord | null> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  if (!sb) {
    const r = memory.find((x) => x.orderId === input.orderId);
    if (!r) return null;
    r.status = "paid";
    r.providerPaymentKey = input.providerPaymentKey ?? null;
    r.method = input.method ?? null;
    r.receiptUrl = input.receiptUrl ?? null;
    r.paidAt = now;
    return r;
  }
  const { data, error } = await sb
    .from("payments")
    .update({
      status: "paid",
      provider_payment_key: input.providerPaymentKey,
      method: input.method,
      receipt_url: input.receiptUrl,
      paid_at: now,
    })
    .eq("order_id", input.orderId)
    .select()
    .single();
  if (error) return null;
  return mapRow(data);
}

export async function markRefunded(input: {
  orderId: string;
  providerPaymentKey?: string;
}): Promise<PaymentRecord | null> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  if (!sb) {
    const r = memory.find((x) => x.orderId === input.orderId);
    if (!r) return null;
    r.status = "refunded";
    r.cancelledAt = now;
    if (input.providerPaymentKey) r.providerPaymentKey = input.providerPaymentKey;
    return r;
  }
  const { data, error } = await sb
    .from("payments")
    .update({ status: "refunded", cancelled_at: now })
    .eq("order_id", input.orderId)
    .select()
    .single();
  if (error) return null;
  return mapRow(data);
}

export async function markFailed(orderId: string): Promise<void> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  if (!sb) {
    const r = memory.find((x) => x.orderId === orderId);
    if (r) {
      r.status = "failed";
      r.failedAt = now;
    }
    return;
  }
  await sb
    .from("payments")
    .update({ status: "failed", failed_at: now })
    .eq("order_id", orderId);
}

export async function getPaymentByOrderId(
  orderId: string,
): Promise<PaymentRecord | null> {
  const sb = getServiceSupabase();
  if (!sb) {
    return memory.find((x) => x.orderId === orderId) ?? null;
  }
  const { data, error } = await sb
    .from("payments")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function getPaidPaymentByProviderKey(
  providerPaymentKey: string,
): Promise<PaymentRecord | null> {
  const sb = getServiceSupabase();
  if (!sb) {
    return (
      memory.find(
        (x) => x.providerPaymentKey === providerPaymentKey && x.status === "paid",
      ) ?? null
    );
  }
  const { data, error } = await sb
    .from("payments")
    .select("*")
    .eq("provider_payment_key", providerPaymentKey)
    .eq("status", "paid")
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function listPayments(
  userEmail: string | null,
): Promise<PaymentRecord[]> {
  const sb = getServiceSupabase();
  if (!sb) {
    return memory.filter((x) => !userEmail || x.userEmail === userEmail).slice(0, 50);
  }
  let q = sb
    .from("payments")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(50);
  if (userEmail) q = q.eq("user_email", userEmail);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []).map(mapRow);
}

function mapRow(r: Record<string, unknown>): PaymentRecord {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    userEmail: (r.user_email as string | null) ?? null,
    plan: r.plan as PlanTier,
    billing: (r.billing as "monthly" | "annual") ?? "monthly",
    amount: Number(r.amount ?? 0),
    currency: (r.currency as string) ?? "KRW",
    status: (r.status as PaymentStatus) ?? "requested",
    provider: (r.provider as string) ?? "toss",
    providerPaymentKey: (r.provider_payment_key as string | null) ?? null,
    method: (r.method as string | null) ?? null,
    receiptUrl: (r.receipt_url as string | null) ?? null,
    requestedAt: r.requested_at as string,
    paidAt: (r.paid_at as string | null) ?? null,
    failedAt: (r.failed_at as string | null) ?? null,
    cancelledAt: (r.cancelled_at as string | null) ?? null,
  };
}
