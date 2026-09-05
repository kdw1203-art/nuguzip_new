import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import { normalizePlan } from "@/lib/billing/plan";
import { getStripe } from "@/lib/billing/stripe";
import { getServiceSupabase } from "@/lib/supabase/service";
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

  /* 멱등 처리(재생 방지) — 서명이 유효한 이벤트라도 Stripe 는 at-least-once 전송이라
     같은 event.id 가 여러 번 들어올 수 있다. event.id 를 PK 로 하는
     stripe_webhook_events 에 "선점(claim)" 을 넣어, 이미 있으면(23505) 재처리하지
     않고 즉시 200 을 돌려준다. 처리 도중 실패하면 선점을 지워 Stripe 재시도가 다시
     처리하도록 한다(recorded-but-unprocessed 함정 회피). */
  const sb = getServiceSupabase();
  if (sb) {
    const { error: claimErr } = await sb
      .from("stripe_webhook_events")
      .insert({ event_id: event.id, event_type: event.type });
    if (claimErr) {
      if (claimErr.code === "23505") {
        return NextResponse.json({ received: true, duplicate: true });
      }
      /* [965] 표가 없어서(42P01) 이 경고만 찍히던 상태가 오래 이어졌다 — 이제 표는
         20260905094000 마이그레이션에 있다. 선점 실패는 error 로 올려 보이게 한다.
         처리는 막지 않는다(fail-soft) — 핸들러가 멱등하다. */
      logger.error("[billing:webhook] dedup claim failed — 재전송 중복 처리 위험", claimErr.message);
    }
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
    // 처리 실패 시 선점 해제 → 다음 재시도가 다시 처리한다.
    if (sb) {
      await sb
        .from("stripe_webhook_events")
        .delete()
        .eq("event_id", event.id)
        .then(undefined, () => {});
    }
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
