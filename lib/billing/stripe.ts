import Stripe from "stripe";

let _stripe: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (_stripe !== undefined) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  _stripe = key ? new Stripe(key) : null;
  return _stripe;
}
