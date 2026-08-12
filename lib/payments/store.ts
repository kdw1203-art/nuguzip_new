import { getServiceSupabase } from "@/lib/supabase/service";
import type { PlanTier } from "@/components/ui-kit";
import { normalizePlan } from "@/lib/billing/plan";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import { logger } from "@/lib/log";

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
  billing: "weekly" | "monthly" | "annual";
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  providerPaymentKey?: string | null;
  method?: string | null;
  receiptUrl?: string | null;
  /** 생성 시 붙인 부가 정보. 유료 리포트 결제는 여기에 reportId 가 들어간다. */
  metadata: Record<string, unknown>;
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
  billing: "weekly" | "monthly" | "annual";
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
    metadata: input.metadata ?? {},
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
  billing: "weekly" | "monthly" | "annual";
  amount: number;
  withinMinutes?: number;
  /** 유료 리포트 결제 재사용 판정용 — 다른 리포트의 결제를 물려주지 않는다. */
  reportId?: string | null;
}): Promise<PaymentRecord | null> {
  const wantReportId = input.reportId ?? null;
  const sameReport = (rec: PaymentRecord) =>
    (typeof rec.metadata.reportId === "string" ? rec.metadata.reportId : null) ===
    wantReportId;
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
        if (!sameReport(x)) return false;
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
  if (!sameReport(rec)) return null;
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
    if (!r || r.status !== "requested") return null;
    r.status = "paid";
    r.providerPaymentKey = input.providerPaymentKey ?? null;
    r.method = input.method ?? null;
    r.receiptUrl = input.receiptUrl ?? null;
    r.paidAt = now;
    return r;
  }
  /* 단일 처리 보장(TOCTOU) — 승인 대기(requested) 상태에서만 paid 로 넘긴다.
     successUrl 새로고침·재시도로 confirm 이 동시에 두 번 들어와도, 상태 조건 덕에
     둘 중 하나만 requested→paid 전이에 성공하고 나머지는 매칭 행이 없어 null 을
     돌려받는다(= 요금제 이중 부여 방지). markFailed 가 쓰는 방식과 동일하다. */
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
    .eq("status", "requested")
    .select()
    .maybeSingle();
  if (error || !data) return null;
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
  const rec = mapRow(data);
  // 환불 시 부여했던 멤버십 권한을 회수한다(환불했는데 이용권은 유지되던 누수 차단).
  await clawBackMembershipOnRefund(rec);
  return rec;
}

/**
 * 환불된 결제가 부여했던 멤버십 등급을 되돌린다.
 *
 * 보수적 규칙: **사용자의 현재 플랜이 환불된 결제의 플랜과 같을 때만** 무료로
 * 강등한다. 사용자가 이후 다른 결제로 등급을 올려 둔 경우를 잘못 회수하지 않기
 * 위함이다. (엄밀히는 남아있는 유효 결제로 권한을 재계산하는 것이 이상적이나,
 * 우선 "환불=권한 유지" 누수를 안전하게 막는 데 초점을 둔다.)
 * 실패해도 환불 자체는 이미 성공했으므로 예외를 삼키고 로깅만 한다.
 */
async function clawBackMembershipOnRefund(rec: PaymentRecord): Promise<void> {
  try {
    if (!rec.userEmail) return;
    // 'basic' 은 무료/단품(Group Pass 등)이라 멤버십 강등 대상이 아니다.
    if (!rec.plan || rec.plan === "basic") return;
    const sb = getServiceSupabase();
    if (!sb) return;
    const em = rec.userEmail.trim().toLowerCase();
    const { data: cur } = await sb
      .from("app_users")
      .select("plan")
      .eq("email", em)
      .maybeSingle();
    if (!cur) return;
    if (normalizePlan(String(cur.plan ?? "")) !== normalizePlan(String(rec.plan))) {
      return; // 현재 플랜이 다르면(이미 다른 결제로 변경됨) 건드리지 않는다.
    }
    await applyPlanToUserByEmail(em, "free");
    logger.warn("[payments:refund] membership clawed back to free", {
      orderId: rec.orderId,
      email: em,
      refundedPlan: rec.plan,
    });
  } catch (e) {
    logger.error(
      "[payments:refund] clawback failed",
      e instanceof Error ? e.message : String(e),
    );
  }
}

/**
 * 결제 실패 기록 — **아직 승인 전(requested)인 건만** 실패로 넘긴다.
 *
 * 예전에는 상태를 보지 않고 덮어써서 이미 승인된 `paid` 행도 failed 로 뒤집을 수
 * 있었다. 돈은 받았는데 장부에는 실패로 남는 상태라 환불·정산이 통째로 어긋난다.
 * 되돌리면 안 되는 상태(paid/cancelled/refunded)는 그대로 둔다 — 여기서 할 수 있는
 * 가장 안전한 실패는 "아무것도 하지 않기" 다.
 */
export async function markFailed(orderId: string): Promise<void> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  if (!sb) {
    const r = memory.find((x) => x.orderId === orderId);
    if (r && r.status === "requested") {
      r.status = "failed";
      r.failedAt = now;
    }
    return;
  }
  await sb
    .from("payments")
    .update({ status: "failed", failed_at: now })
    .eq("order_id", orderId)
    .eq("status", "requested");
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
    billing: (r.billing as "weekly" | "monthly" | "annual") ?? "monthly",
    amount: Number(r.amount ?? 0),
    currency: (r.currency as string) ?? "KRW",
    status: (r.status as PaymentStatus) ?? "requested",
    provider: (r.provider as string) ?? "toss",
    providerPaymentKey: (r.provider_payment_key as string | null) ?? null,
    method: (r.method as string | null) ?? null,
    receiptUrl: (r.receipt_url as string | null) ?? null,
    metadata:
      r.metadata && typeof r.metadata === "object"
        ? (r.metadata as Record<string, unknown>)
        : {},
    requestedAt: r.requested_at as string,
    paidAt: (r.paid_at as string | null) ?? null,
    failedAt: (r.failed_at as string | null) ?? null,
    cancelledAt: (r.cancelled_at as string | null) ?? null,
  };
}
