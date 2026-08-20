import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * 토스 자동결제(빌링) 구독 원장 — public.billing_subscriptions 접근 계층.
 *
 * 원칙:
 *  - billingKey 는 카드 정보의 대체값이다(토스 빌링 문서). **이 모듈 밖으로,
 *    특히 클라이언트로 절대 내보내지 않는다.** 화면에 필요한 것은 카드사·마스킹
 *    번호·상태·다음 결제일뿐이라, 공개용 타입(PublicBillingSubscription)에는
 *    billingKey/customerKey 를 아예 싣지 않는다.
 *  - customerKey 는 DB 가 만드는 무작위 UUID(문서: 이메일 등 유추 가능 값 금지).
 *  - 상태 전이는 store 함수가 조건부 UPDATE 로 수행한다 — markPaid 와 같은
 *    TOCTOU 방지 패턴(전이 조건에 안 맞으면 null 을 돌려주고 아무것도 안 바꾼다).
 */

export type BillingSubStatus = "pending" | "active" | "suspended" | "canceled" | "deleted";

export type BillingSubscription = {
  id: string;
  userEmail: string;
  customerKey: string;
  /** 서버 전용 — 응답으로 직렬화하지 말 것 */
  billingKey: string | null;
  cardCompany: string | null;
  cardNumberMasked: string | null;
  plan: "pro" | "expert";
  billing: "monthly" | "annual";
  amount: number;
  status: BillingSubStatus;
  failCount: number;
  nextChargeAt: string | null;
  lastOrderId: string | null;
  lastError: string | null;
  createdAt: string;
  canceledAt: string | null;
};

/** 화면·API 응답용 — 비밀값(billingKey·customerKey) 없음 */
export type PublicBillingSubscription = Pick<
  BillingSubscription,
  | "plan"
  | "billing"
  | "amount"
  | "status"
  | "cardCompany"
  | "cardNumberMasked"
  | "nextChargeAt"
  | "canceledAt"
>;

export function toPublic(sub: BillingSubscription): PublicBillingSubscription {
  return {
    plan: sub.plan,
    billing: sub.billing,
    amount: sub.amount,
    status: sub.status,
    cardCompany: sub.cardCompany,
    cardNumberMasked: sub.cardNumberMasked,
    nextChargeAt: sub.nextChargeAt,
    canceledAt: sub.canceledAt,
  };
}

function mapRow(r: Record<string, unknown>): BillingSubscription {
  return {
    id: String(r.id),
    userEmail: String(r.user_email),
    customerKey: String(r.customer_key),
    billingKey: (r.billing_key as string | null) ?? null,
    cardCompany: (r.card_company as string | null) ?? null,
    cardNumberMasked: (r.card_number_masked as string | null) ?? null,
    plan: r.plan as "pro" | "expert",
    billing: r.billing as "monthly" | "annual",
    amount: Number(r.amount ?? 0),
    status: (r.status as BillingSubStatus) ?? "pending",
    failCount: Number(r.fail_count ?? 0),
    nextChargeAt: (r.next_charge_at as string | null) ?? null,
    lastOrderId: (r.last_order_id as string | null) ?? null,
    lastError: (r.last_error as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
    canceledAt: (r.canceled_at as string | null) ?? null,
  };
}

function sb() {
  const client = getServiceSupabase();
  if (!client) throw new Error("서비스 클라이언트 미구성 — 빌링 저장소를 쓸 수 없습니다");
  return client;
}

/**
 * 카드 등록 시작 — pending 행을 만들거나(같은 조건이면) 재사용해 customerKey 를 받는다.
 * 재사용 이유: 카드 등록 창을 닫았다 다시 열 때마다 행이 쌓이는 것을 막는다.
 */
export async function startPendingSubscription(input: {
  userEmail: string;
  plan: "pro" | "expert";
  billing: "monthly" | "annual";
  amount: number;
}): Promise<BillingSubscription> {
  const client = sb();
  const { data: existing } = await client
    .from("billing_subscriptions")
    .select("*")
    .eq("user_email", input.userEmail)
    .eq("status", "pending")
    .eq("plan", input.plan)
    .eq("billing", input.billing)
    .eq("amount", input.amount)
    .is("billing_key", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return mapRow(existing);

  const { data, error } = await client
    .from("billing_subscriptions")
    .insert({
      user_email: input.userEmail,
      plan: input.plan,
      billing: input.billing,
      amount: input.amount,
    })
    .select()
    .single();
  if (error) throw new Error(`빌링 구독 생성 실패: ${error.message}`);
  return mapRow(data);
}

export async function getByCustomerKey(customerKey: string): Promise<BillingSubscription | null> {
  const { data, error } = await sb()
    .from("billing_subscriptions")
    .select("*")
    .eq("customer_key", customerKey)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

/** 사용자의 살아 있는(청구 예정 또는 일시중단) 자동결제 1건 */
export async function getLiveSubscriptionByEmail(
  userEmail: string,
): Promise<BillingSubscription | null> {
  const { data, error } = await sb()
    .from("billing_subscriptions")
    .select("*")
    .eq("user_email", userEmail)
    .in("status", ["active", "suspended"])
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

/** 빌링키 발급 결과 저장 (pending 행에만) */
export async function attachBillingKey(input: {
  id: string;
  billingKey: string;
  cardCompany: string | null;
  cardNumberMasked: string | null;
}): Promise<BillingSubscription | null> {
  const { data, error } = await sb()
    .from("billing_subscriptions")
    .update({
      billing_key: input.billingKey,
      card_company: input.cardCompany,
      card_number_masked: input.cardNumberMasked,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

/**
 * 카드 변경(재등록) — 살아 있는(active/suspended) 구독의 빌링키·카드 정보를
 * 새 값으로 교체한다. 추가 결제 없음. suspended(결제 실패 정지) 구독은
 * reactivate=true 로 다시 active 로 올리고 next_charge_at 을 지금으로 당겨
 * 다음 크론이 새 카드로 즉시 재청구하게 한다(실패 복구 경로).
 */
export async function replaceSubscriptionCard(input: {
  id: string;
  billingKey: string;
  cardCompany: string | null;
  cardNumberMasked: string | null;
  reactivate?: boolean;
}): Promise<BillingSubscription | null> {
  const patch: Record<string, unknown> = {
    billing_key: input.billingKey,
    card_company: input.cardCompany,
    card_number_masked: input.cardNumberMasked,
    updated_at: new Date().toISOString(),
  };
  if (input.reactivate) {
    patch.status = "active";
    patch.next_charge_at = new Date().toISOString();
  }
  const { data, error } = await sb()
    .from("billing_subscriptions")
    .update(patch)
    .eq("id", input.id)
    .in("status", ["active", "suspended"])
    .select()
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

/**
 * 활성화 — 첫 결제 성공 후. DB 부분 유니크(살아 있는 구독 1건/사용자)와 충돌하지
 * 않도록 기존 active/suspended 를 먼저 canceled 로 접는다(플랜 변경 = 교체).
 */
export async function activateSubscription(input: {
  id: string;
  userEmail: string;
  nextChargeAt: string;
  lastOrderId: string;
}): Promise<BillingSubscription | null> {
  const client = sb();
  const now = new Date().toISOString();
  await client
    .from("billing_subscriptions")
    .update({ status: "canceled", canceled_at: now, updated_at: now })
    .eq("user_email", input.userEmail)
    .in("status", ["active", "suspended"])
    .neq("id", input.id);
  const { data, error } = await client
    .from("billing_subscriptions")
    .update({
      status: "active",
      fail_count: 0,
      next_charge_at: input.nextChargeAt,
      last_order_id: input.lastOrderId,
      last_error: null,
      updated_at: now,
    })
    .eq("id", input.id)
    .in("status", ["pending", "active"])
    .select()
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

/** 갱신 성공 — 다음 결제 시각 전진, 실패 카운터 리셋 */
export async function recordRenewalSuccess(input: {
  id: string;
  nextChargeAt: string;
  lastOrderId: string;
}): Promise<void> {
  await sb()
    .from("billing_subscriptions")
    .update({
      fail_count: 0,
      next_charge_at: input.nextChargeAt,
      last_order_id: input.lastOrderId,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("status", "active");
}

/** 갱신 실패 — 카운터 증가, 임계 초과 또는 재시도 불가 코드면 suspended */
export async function recordRenewalFailure(input: {
  id: string;
  error: string;
  suspend: boolean;
}): Promise<void> {
  const client = sb();
  const { data } = await client
    .from("billing_subscriptions")
    .select("fail_count")
    .eq("id", input.id)
    .maybeSingle();
  const failCount = Number(data?.fail_count ?? 0) + 1;
  await client
    .from("billing_subscriptions")
    .update({
      fail_count: failCount,
      last_error: input.error.slice(0, 500),
      ...(input.suspend ? { status: "suspended" } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("status", "active");
}

/** 사용자 해지 — 청구만 멈춘다. 이미 결제한 기간은 plan_expires_at 까지 유지. */
export async function cancelSubscription(input: {
  userEmail: string;
}): Promise<BillingSubscription | null> {
  const now = new Date().toISOString();
  const { data, error } = await sb()
    .from("billing_subscriptions")
    .update({ status: "canceled", canceled_at: now, updated_at: now })
    .eq("user_email", input.userEmail)
    .in("status", ["active", "suspended"])
    .select()
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

/**
 * BILLING_DELETED 웹훅 반영 — customerKey+billingKey **둘 다** 일치하는 행만.
 * 페이로드에 서명이 없으므로 billingKey(서버 전용 값) 일치 자체가 진위 확인이다.
 */
export async function markDeletedByBillingKey(input: {
  billingKey: string;
}): Promise<BillingSubscription | null> {
  const now = new Date().toISOString();
  const { data, error } = await sb()
    .from("billing_subscriptions")
    .update({ status: "deleted", updated_at: now })
    .eq("billing_key", input.billingKey)
    .in("status", ["pending", "active", "suspended"])
    .select()
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

/** 갱신 크론용 — 청구 시각이 지난 active 구독 (오래된 순) */
export async function listDueSubscriptions(limit: number): Promise<BillingSubscription[]> {
  const { data, error } = await sb()
    .from("billing_subscriptions")
    .select("*")
    .eq("status", "active")
    .not("billing_key", "is", null)
    .lte("next_charge_at", new Date().toISOString())
    .order("next_charge_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`갱신 대상 조회 실패: ${error.message}`);
  return (data ?? []).map(mapRow);
}

/** 자동결제 구독이 살아 있는 이메일 집합 — 만료 사전 알림에서 제외할 대상 */
export async function listLiveBillingEmails(): Promise<Set<string>> {
  const { data, error } = await sb()
    .from("billing_subscriptions")
    .select("user_email")
    .in("status", ["active", "suspended"]);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => String(r.user_email).trim().toLowerCase()));
}
