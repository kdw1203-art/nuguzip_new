/**
 * #20 매물 노출 부스트 결제 (스캐폴드) — POST /api/billing/boost
 * body: { listingId }. 로그인 + 매물 소유자 본인만.
 * Stripe 비밀키/Price ID 가 모두 설정된 경우에만 7일 부스트용 1회성(one-off)
 * Checkout 세션을 생성해 { url } 을 반환한다.
 * 키가 없으면 503 { error: "payment_unconfigured" } — 기존 checkout 라우트와 동일하게
 * graceful no-op. (실제 boost_until 설정은 webhook 소관 — 본 스캐폴드 범위 밖)
 */
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing/stripe";
import { desktopBaseUrl, resolvePublicOriginFromHeaders } from "@/lib/platform-shell";
import { safeAuth } from "@/lib/safe-auth";
import { getListingById } from "@/lib/listings/store-db";
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
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 키/Price 미설정 시 결제 미구성 — DB 접근 전에 먼저 503 (graceful no-op)
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_BOOST?.trim();
  if (!stripe || !priceId) {
    return NextResponse.json({ error: "payment_unconfigured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { listingId?: string };
  const listingId = String(body.listingId ?? "").trim();
  if (!listingId) {
    return NextResponse.json({ error: "listingId가 필요합니다." }, { status: 400 });
  }

  const listing = await getListingById(listingId);
  if (!listing) {
    return NextResponse.json({ error: "매물을 찾을 수 없습니다." }, { status: 404 });
  }
  if (listing.authorEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
    return NextResponse.json(
      { error: "본인 매물만 부스트할 수 있어요." },
      { status: 403 },
    );
  }

  const base = appOriginFromRequest(req);
  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/payment/success?provider=stripe&kind=boost&listing=${encodeURIComponent(listingId)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/payment/fail?provider=stripe&kind=boost&checkout=cancel`,
      client_reference_id: email,
      metadata: {
        kind: "listing_boost",
        listingId,
        boostDays: "7",
        email,
      },
    });
    if (!checkout.url) {
      return NextResponse.json(
        { error: "Checkout URL 을 받지 못했습니다." },
        { status: 500 },
      );
    }
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    logger.error("[billing:boost]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Checkout 생성 실패" },
      { status: 500 },
    );
  }
}
