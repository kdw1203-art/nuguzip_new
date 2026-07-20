import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";

export type SubscriptionCheckoutInput = {
  userId: string;
  email: string;
  priceId: string;
  plan: string;
  successUrl: string;
  cancelUrl: string;
  source?: string;
  campaign?: string;
};

/**
 * Stripe Checkout Session — 구독(mode: subscription).
 * Webhook `checkout.session.completed` 및 `/payment/success?provider=stripe` 백업 검증과 함께 사용.
 */
export async function createSubscriptionCheckout(
  input: SubscriptionCheckoutInput,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("STRIPE_SECRET_KEY 가 설정되지 않았습니다.");
  }

  const source = input.source?.trim().slice(0, 80) || "pricing";
  const campaign = input.campaign?.trim().slice(0, 80) || "stripe";

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: input.email,
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    allow_promotion_codes: true,
    metadata: {
      userId: input.userId,
      email: input.email,
      plan: input.plan,
      woodong: "1",
      source,
      campaign,
    },
    subscription_data: {
      metadata: {
        userId: input.userId,
        email: input.email,
        plan: input.plan,
      },
    },
  });
}
