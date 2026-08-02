import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import { normalizePlan } from "@/lib/billing/plan";
import { getStripe } from "@/lib/billing/stripe";
import { logger } from "@/lib/log";
import { recordPlatformEvent } from "@/lib/platform-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function applyPlanFromCheckoutSession(s: Stripe.Checkout.Session): Promise<void> {
  const email = String(
    s.metadata?.email || s.customer_details?.email || s.customer_email || "",
  )
    .trim()
    .toLowerCase();
  const plan = normalizePlan(s.metadata?.plan);
  if (!email || plan === "free") return;
  const ok = await applyPlanToUserByEmail(email, plan);
  if (!ok) {
    logger.warn(
      "[billing:webhook] app_users 에 해당 이메일이 없어 plan 미반영:",
      email,
    );
    return;
  }
  /* 항목 39 — 전환 출처를 이행 시점에 버리지 않는다. checkout 이 metadata 로
     실어 보낸 source/campaign 을 plan_granted 이벤트로 영속화한다. 결제가
     열리는 날 "어떤 벽이 전환시켰는지"를 셀 수 있는 유일한 기록이다. fail-soft. */
  try {
    await recordPlatformEvent({
      /* Stripe 웹훅에는 사용자 단말 정보가 없다 — desktop 을 기본값으로 쓴다
         (PlatformShell 은 desktop|mobile 두 값뿐이고, 출처 분석의 축은
         source/campaign 이지 platform 이 아니다). */
      platform: "desktop",
      eventName: "plan_granted",
      userEmail: email,
      source: String(s.metadata?.source ?? "") || null,
      campaign: String(s.metadata?.campaign ?? "") || null,
      metadata: { plan, rail: "stripe", checkoutSessionId: s.id },
    });
  } catch (e) {
    logger.warn("[billing:webhook] plan_granted 이벤트 기록 실패", e);
  }
}

async function applyPlanFromSubscription(sub: Stripe.Subscription): Promise<void> {
  const email = String(sub.metadata?.email || "").trim().toLowerCase();
  const plan = normalizePlan(sub.metadata?.plan);
  if (!email) return;
  if (sub.status === "active" || sub.status === "trialing") {
    if (plan !== "free") await applyPlanToUserByEmail(email, plan);
    return;
  }
  if (
    sub.status === "canceled" ||
    sub.status === "unpaid" ||
    sub.status === "incomplete_expired"
  ) {
    await applyPlanToUserByEmail(email, "free");
  }
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !whSecret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const sig = (await headers()).get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing stripe-signature" }, { status: 400 });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (e) {
    logger.error("[billing:webhook]", e);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await applyPlanFromCheckoutSession(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applyPlanFromSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (e) {
    logger.error("[billing:webhook] handler", e);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
