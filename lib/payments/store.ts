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
    /* 로그에는 주문번호만 — 이메일은 payments 행에서 찾을 수 있다(개인정보 로그 유출 방지) */
    logger.warn("[payments:refund] membership clawed back to free", {
      orderId: rec.orderId,
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
/**
 * 미완료 종료로 표시 — 결제창 만료(EXPIRED)·사용자 중단(ABORTED).
 *
 * 왜 markFailed 와 갈라야 하나(2026-08-25 실측): 이 둘을 `failed` 로 적고
 * 있었는데 그건 **카드가 거절된 것**을 뜻하는 상태다. 실제로 "결제 실패 2건 /
 * 시도 3건" critical 경보가 울렸고 그 둘은 전부 결제창을 닫은 미완료 시도였다.
 * 지표가 거짓말을 하면 진짜 거절이 왔을 때 아무도 안 믿는다.
 *
 * markFailed 와 같은 보호: `requested` 인 행만 바꾼다 — 이미 승인된 결제를
 * 뒤집는 일은 없다.
 */
export async function markCancelled(orderId: string): Promise<void> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  if (!sb) {
    const r = memory.find((x) => x.orderId === orderId);
    if (r && r.status === "requested") {
      r.status = "cancelled";
      r.cancelledAt = now;
    }
    return;
  }
  await sb
    .from("payments")
    .update({ status: "cancelled", cancelled_at: now })
    .eq("order_id", orderId)
    .eq("status", "requested");
}

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
  /* [965] 같은 결제 키로 paid 행이 둘이면 maybeSingle 은 오류(PGRST116)를 내고
     예전 코드는 그걸 "중복 없음(null)" 으로 읽었다 — 중복을 잡으라고 있는 함수가
     정확히 중복이 있을 때 꺼졌다. 가장 먼저 승인된 행 하나를 돌려준다. */
  const { data, error } = await sb
    .from("payments")
    .select("*")
    .eq("provider_payment_key", providerPaymentKey)
    .eq("status", "paid")
    .order("paid_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

/**
 * [965] 결제사가 "승인 완료(DONE)" 라고 확인한 주문을 **어떤 상태에서든** paid 로
 * 올린다. markPaid 는 requested 에서만 전이한다(이중 부여 방지) — 그런데
 *   · 승인 요청 뒤 응답이 유실돼 catch 가 failed 로 적어 둔 뒤 재시도가 성공하거나
 *   · 45분 방치 스윕이 cancelled 로 적은 뒤 웹훅/지연 승인이 도착하거나
 *   · 갱신 크론의 앞 회차 실패(failed) 뒤 같은 orderId 로 재시도가 성공하면
 * 돈은 받았는데 원장은 failed/cancelled 로 남고 플랜은 안 켜졌다. 결제사 조회로
 * DONE 이 확인된 경우에만 부르며, 이미 paid 면 그대로(멱등) 돌려준다.
 * 원장 상태를 바꾼 사실은 warn 으로 남겨 조정(reconciliation)이 보이게 한다.
 */
export async function promotePaidAfterProviderConfirmation(input: {
  orderId: string;
  providerPaymentKey: string;
  method?: string;
  receiptUrl?: string;
  reason: string;
}): Promise<PaymentRecord | null> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  if (!sb) {
    const r = memory.find((x) => x.orderId === input.orderId);
    if (!r) return null;
    if (r.status === "paid") return r;
    r.status = "paid";
    r.providerPaymentKey = input.providerPaymentKey;
    r.method = input.method ?? r.method;
    r.receiptUrl = input.receiptUrl ?? r.receiptUrl;
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
      failed_at: null,
      cancelled_at: null,
    })
    .eq("order_id", input.orderId)
    .in("status", ["requested", "failed", "cancelled"])
    .select()
    .maybeSingle();
  if (error) {
    logger.error("[payments] paid 승격 실패", { orderId: input.orderId, message: error.message });
    return null;
  }
  if (data) {
    logger.warn("[payments] 결제사 승인 확인 후 원장 상태를 paid 로 조정", {
      orderId: input.orderId,
      reason: input.reason,
    });
    return mapRow(data);
  }
  /* 매칭 행이 없다 = 이미 paid(멱등) 이거나 refunded — 현재 행을 그대로 */
  const current = await getPaymentByOrderId(input.orderId);
  return current?.status === "paid" ? current : null;
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
