import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { resolveIapProduct } from "@/lib/subscriptions/iap-products";

/**
 * POST /api/billing/iap/verify
 * iOS App Store / Google Play 영수증 검증
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const platform = String(body.platform ?? "");
  const receipt = String(body.receipt ?? body.purchaseToken ?? "").trim();
  const productId = String(body.productId ?? "").trim();
  const sandbox = Boolean(body.sandbox);

  if (!platform || !receipt || !productId) {
    return NextResponse.json(
      { error: "platform, receipt(purchaseToken), productId required" },
      { status: 400 },
    );
  }

  if (platform !== "ios" && platform !== "android") {
    return NextResponse.json({ error: "platform must be ios or android" }, { status: 400 });
  }

  const product = resolveIapProduct(productId);
  if (!product) {
    return NextResponse.json({ error: "unknown_product_id", productId }, { status: 400 });
  }

  const appleSecret = process.env.APPLE_IAP_SHARED_SECRET?.trim();
  const googlePackage = process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim();
  const devBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.IAP_DEV_BYPASS?.trim() === "1";

  if (platform === "ios" && !appleSecret && !devBypass) {
    return NextResponse.json({
      valid: false,
      configured: false,
      message: "APPLE_IAP_SHARED_SECRET 미설정",
      productId,
      plan: product.plan,
    });
  }

  if (platform === "android" && !googlePackage && !devBypass) {
    return NextResponse.json({
      valid: false,
      configured: false,
      message: "GOOGLE_PLAY_PACKAGE_NAME 미설정",
      productId,
      plan: product.plan,
    });
  }

  let verified = false;
  let verifyMessage = "pending_verification";

  if (devBypass && receipt.startsWith("dev:")) {
    verified = true;
    verifyMessage = "dev_bypass";
  } else if (platform === "ios" && appleSecret) {
    // Apple verifyReceipt — production / sandbox 자동 전환
    const endpoints = sandbox
      ? ["https://sandbox.itunes.apple.com/verifyReceipt"]
      : [
          "https://buy.itunes.apple.com/verifyReceipt",
          "https://sandbox.itunes.apple.com/verifyReceipt",
        ];
    for (const url of endpoints) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "receipt-data": receipt,
          password: appleSecret,
          "exclude-old-transactions": true,
        }),
      });
      const data = (await res.json()) as { status?: number };
      if (data.status === 0) {
        verified = true;
        verifyMessage = "apple_verified";
        break;
      }
      if (data.status === 21007 && !sandbox) continue;
    }
  } else if (platform === "android" && googlePackage) {
    // Play Developer API는 서비스 계정 JSON 필요 — 토큰 있으면 검증 시도
    const accessToken = process.env.GOOGLE_PLAY_ACCESS_TOKEN?.trim();
    if (accessToken) {
      const res = await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${googlePackage}/purchases/subscriptions/${productId}/tokens/${encodeURIComponent(receipt)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (res.ok) {
        const data = (await res.json()) as { paymentState?: number };
        verified = data.paymentState === 1 || data.paymentState === 2;
        verifyMessage = verified ? "google_verified" : "google_unpaid";
      }
    } else {
      verifyMessage = "google_token_missing";
    }
  }

  if (!verified) {
    return NextResponse.json({
      valid: false,
      configured: true,
      platform,
      productId,
      plan: product.plan,
      subscriptionState: "pending_verification",
      message: verifyMessage,
    });
  }

  const sb = getServiceSupabase();
  const email = session.user.email.toLowerCase();
  const periodEnd = new Date();
  if (product.interval === "annual") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  if (sb) {
    await sb.from("app_users").update({ plan: product.plan }).eq("email", email);
    await sb.from("payments").insert({
      order_id: `iap-${platform}-${email}-${Date.now()}`,
      user_email: email,
      plan: product.plan,
      billing: product.interval,
      amount: product.priceKrw,
      status: "paid",
      provider: platform === "ios" ? "app_store" : "play_store",
      paid_at: new Date().toISOString(),
      metadata: { productId, verifyMessage },
    });
  }

  return NextResponse.json({
    valid: true,
    platform,
    productId,
    plan: product.plan,
    interval: product.interval,
    subscriptionState: "active",
    message: verifyMessage,
    currentPeriodEnd: periodEnd.toISOString(),
  });
}
