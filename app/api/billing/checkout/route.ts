import { NextResponse } from "next/server";
import { createSubscriptionCheckout } from "@/lib/billing/stripe-checkout";
import { getStripe } from "@/lib/billing/stripe";
import { desktopBaseUrl, resolvePublicOriginFromHeaders } from "@/lib/platform-shell";
import { safeAuth } from "@/lib/safe-auth";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

function appOriginFromRequest(req: Request): string {
  try {
    return resolvePublicOriginFromHeaders(req.headers);
  } catch {
    return desktopBaseUrl();
  }
}

export async function POST(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      {
        error:
          "Stripe 비밀키가 없습니다. STRIPE_SECRET_KEY 와 Price ID 환경변수를 설정하세요.",
      },
      { status: 503 },
    );
  }

  let plan: "pro" | "expert" | "enterprise" = "pro";
  let source = "pricing";
  let campaign = "stripe_alt";
  try {
    const j = (await req.json()) as { plan?: string; source?: string; campaign?: string };
    if (j?.plan === "expert") plan = "expert";
    else if (j?.plan === "enterprise") plan = "enterprise";
    if (typeof j.source === "string" && j.source.trim()) source = j.source.trim().slice(0, 80);
    if (typeof j.campaign === "string" && j.campaign.trim()) campaign = j.campaign.trim().slice(0, 80);
  } catch {
    /* default pro */
  }

  const priceId =
    plan === "enterprise"
      ? process.env.STRIPE_PRICE_ENTERPRISE?.trim()
      : plan === "expert"
        ? process.env.STRIPE_PRICE_EXPERT?.trim()
        : process.env.STRIPE_PRICE_PRO?.trim();
  if (!priceId) {
    return NextResponse.json(
      {
        error:
          "STRIPE_PRICE_PRO / STRIPE_PRICE_EXPERT / STRIPE_PRICE_ENTERPRISE 가 비어 있습니다.",
      },
      { status: 503 },
    );
  }

  const base = appOriginFromRequest(req);
  const email = session.user.email!;
  const userId = session.user.id || email;

  try {
    const checkout = await createSubscriptionCheckout({
      userId,
      email,
      priceId,
      plan,
      source,
      campaign,
      successUrl: `${base}/payment/success?provider=stripe&session_id={CHECKOUT_SESSION_ID}&source=${encodeURIComponent(source)}&campaign=${encodeURIComponent(campaign)}`,
      cancelUrl: `${base}/payment/fail?provider=stripe&checkout=cancel&source=${encodeURIComponent(source)}&campaign=${encodeURIComponent(campaign)}`,
    });
    if (!checkout.url) {
      return NextResponse.json(
        { error: "Checkout URL 을 받지 못했습니다." },
        { status: 500 },
      );
    }
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    logger.error("[billing:checkout]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Checkout 생성 실패" },
      { status: 500 },
    );
  }
}
