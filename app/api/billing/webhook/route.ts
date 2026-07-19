import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import { normalizePlan } from "@/lib/billing/plan";
import { getStripe } from "@/lib/billing/stripe";
import { logger } from "@/lib/log";

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
