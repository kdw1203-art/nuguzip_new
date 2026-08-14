import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import {
  chargeBillingKey,
  deterministicIdempotencyKey,
  isTossBillingEnabled,
  issueBillingKey,
} from "@/lib/payments/toss-billing";
import {
  activateSubscription,
  attachBillingKey,
  getByCustomerKey,
} from "@/lib/payments/billing-store";
import { createPayment, markFailed, markPaid } from "@/lib/payments/store";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import type { AppPlan } from "@/lib/billing/plan";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * requestBillingAuth successUrl 랜딩 — authKey → 빌링키 발급 → 첫 결제 → 활성화.
 *
 * 빌링 문서 흐름 그대로다:
 *  1) successUrl 쿼리로 customerKey + authKey 가 온다.
 *  2) POST /v1/billing/authorizations/issue 로 billingKey 발급 (authKey 는 1회용).
 *  3) billingKey 는 서버 저장소에만 두고, 첫 주기 결제를 즉시 승인한다.
 *  4) 다음 청구 시각을 기록하고 크론(billing-renewals)이 이어받는다.
 *
 * 멱등성: 사용자가 이 URL 을 새로고침하면 authKey 재교환은 실패하지만,
 * 구독이 이미 active 면 발급을 건너뛰고 성공 화면으로 보낸다 — 두 번 눌러도
 * 두 번 결제되지 않는다(첫 결제의 멱등키도 구독 id 로 고정).
 *
 * 보안: customerKey 는 무작위 UUID 라 남의 값을 유추할 수 없고, 유추했더라도
 * 세션 이메일과 구독 소유자가 다르면 여기서 끊는다.
 */

const PLAN_LABEL: Record<string, string> = { pro: "플러스", expert: "프로" };

function fail(origin: string, code: string): NextResponse {
  const u = new URL("/payment/fail", origin);
  u.searchParams.set("code", code);
  return NextResponse.redirect(u, 303);
}

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  const origin = req.nextUrl.origin;
  if (!isTossBillingEnabled()) return fail(origin, "NOT_CONFIGURED");

  const customerKey = req.nextUrl.searchParams.get("customerKey")?.trim() ?? "";
  const authKey = req.nextUrl.searchParams.get("authKey")?.trim() ?? "";
  if (!customerKey || !authKey) return fail(origin, "MISSING_PARAMS");

  const session = await safeAuth();
  const userEmail = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!userEmail) {
    const u = new URL("/login", origin);
    u.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(u, 303);
  }

  const sub = await getByCustomerKey(customerKey).catch(() => null);
  if (!sub) return fail(origin, "MISSING_PARAMS");
  if (sub.userEmail !== userEmail) return fail(origin, "FORBIDDEN");

  // 새로고침 멱등 — 이미 활성화된 구독이면 성공 화면으로
  if (sub.status === "active" && sub.billingKey) {
    const u = new URL("/payment/success", origin);
    u.searchParams.set("provider", "toss-billing");
    if (sub.lastOrderId) u.searchParams.set("orderId", sub.lastOrderId);
    return NextResponse.redirect(u, 303);
  }
  if (sub.status !== "pending") return fail(origin, "NOT_CONFIGURED");

  // 1) 빌링키 발급 (이미 발급돼 있으면 재사용 — authKey 만료 새로고침 대비)
  let billingKey = sub.billingKey;
  if (!billingKey) {
    const issued = await issueBillingKey(authKey, customerKey);
    if (!issued.ok) {
      logger.warn("[toss-billing] 빌링키 발급 실패", {
        code: issued.code,
        status: issued.status,
      });
      return fail(origin, issued.code ?? "PROVIDER_ERROR");
    }
    const saved = await attachBillingKey({
      id: sub.id,
      billingKey: issued.data.billingKey,
      cardCompany: issued.data.cardCompany,
      cardNumberMasked: issued.data.cardNumberMasked,
    });
    if (!saved) return fail(origin, "PROVIDER_ERROR");
    billingKey = issued.data.billingKey;
  }

  // 2) 첫 주기 결제 — 단건 결제와 같은 원장(payments)에 기록한다
  const orderId = `BILLING-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const orderName = `누구집 ${PLAN_LABEL[sub.plan]} ${sub.billing === "annual" ? "연간" : "월간"} 자동결제`;
  try {
    await createPayment({
      orderId,
      userEmail,
      plan: sub.plan,
      billing: sub.billing,
      amount: sub.amount,
      provider: "toss-billing",
      metadata: { billingSubscriptionId: sub.id, cycle: "init" },
    });
  } catch (e) {
    logger.error("[toss-billing] 첫 결제 주문 기록 실패", e);
    return fail(origin, "PROVIDER_ERROR");
  }

  const charged = await chargeBillingKey({
    billingKey,
    customerKey,
    amount: sub.amount,
    orderId,
    orderName,
    customerEmail: userEmail,
    idempotencyKey: deterministicIdempotencyKey(`nuguzip:toss:billing:${sub.id}:init`),
  });
  if (!charged.ok) {
    await markFailed(orderId);
    logger.warn("[toss-billing] 첫 결제 승인 실패", { code: charged.code, status: charged.status });
    return fail(origin, charged.code ?? "PROVIDER_ERROR");
  }

  // 금액 재검증 — 승인 응답의 totalAmount 가 우리가 청구한 금액과 달라선 안 된다
  if (charged.data.totalAmount != null && Number(charged.data.totalAmount) !== sub.amount) {
    logger.error("[toss-billing] 첫 결제 금액 불일치", {
      expected: sub.amount,
      got: charged.data.totalAmount,
    });
    return fail(origin, "AMOUNT_MISMATCH");
  }

  await markPaid({
    orderId,
    providerPaymentKey: charged.data.paymentKey,
    method: "카드(자동결제)",
  });
  const periodDays = sub.billing === "annual" ? 365 : 30;
  await applyPlanToUserByEmail(userEmail, sub.plan as AppPlan, { durationDays: periodDays });

  /* 다음 청구는 만료 이틀 전 — applyPlan 은 같은 플랜의 미래 만료 시각에 이어
     붙이므로(연장 규칙) 미리 청구해도 이용 기간이 깎이지 않고, 실패 시 만료 전에
     이틀의 재시도 창이 생긴다. */
  const nextChargeAt = new Date(Date.now() + (periodDays - 2) * 86_400_000).toISOString();
  const activated = await activateSubscription({
    id: sub.id,
    userEmail,
    nextChargeAt,
    lastOrderId: orderId,
  });
  if (!activated) {
    // 결제는 성공했으므로 실패로 돌리지 않는다 — 로그만 남기고 성공 화면으로
    logger.error("[toss-billing] 활성화 전이 실패(결제는 성공)", { orderId });
  }

  const u = new URL("/payment/success", origin);
  u.searchParams.set("provider", "toss-billing");
  u.searchParams.set("orderId", orderId);
  return NextResponse.redirect(u, 303);
}
