import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { resolveIapProduct } from "@/lib/subscriptions/iap-products";

/** Apple verifyReceipt 의 거래 항목(필요한 필드만). */
type AppleTransaction = {
  product_id?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  expires_date_ms?: string | number;
  purchase_date_ms?: string | number;
};

/** 문자열/숫자로 섞여 오는 epoch ms 를 숫자로. 못 읽으면 null(= "모른다"). */
function toMillis(v: string | number | undefined | null): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 요청한 productId 와 **같은 상품**의 거래만 고른다. 구독이면 아직 유효한
 * (expires_date_ms > now) 거래여야 한다 — 만료된 옛 영수증으로 유료 기간이
 * 되살아나는 길을 막는다. 여러 건이면 만료가 가장 늦은 것을 쓴다.
 */
function pickAppleTransaction(
  transactions: AppleTransaction[],
  productId: string,
): AppleTransaction | null {
  const now = Date.now();
  const sameProduct = transactions.filter(
    (t) => String(t.product_id ?? "").trim() === productId,
  );
  if (sameProduct.length === 0) return null;
  const active = sameProduct.filter((t) => {
    const exp = toMillis(t.expires_date_ms);
    // 만료 필드가 없으면 비소모성/소모성 구매 — 만료 개념이 없으므로 통과.
    return exp === null || exp > now;
  });
  if (active.length === 0) return null;
  return active.reduce((best, t) =>
    (toMillis(t.expires_date_ms) ?? 0) > (toMillis(best.expires_date_ms) ?? 0) ? t : best,
  );
}

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
  /* 스토어가 실제로 발급한 거래의 식별자. 이 값이 없으면 "검증됐다"고 말할 수
     없다 — 아래 iap_receipts 결속(1회·1계정)이 전부 여기에 매달려 있다. */
  let transactionKey = "";
  let verifiedExpiresAtMs: number | null = null;
  let rawEvidence: Record<string, unknown> | null = null;

  if (devBypass && receipt.startsWith("dev:")) {
    verified = true;
    verifyMessage = "dev_bypass";
    transactionKey = receipt;
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
      const data = (await res.json()) as {
        status?: number;
        latest_receipt_info?: AppleTransaction[];
        receipt?: { in_app?: AppleTransaction[] };
      };
      if (data.status === 0) {
        /* status===0 은 "영수증 서명이 유효하다"까지만 말해 준다. **무엇을 샀는지**
           는 거래 목록에 있다. 여기를 안 보면 클라이언트가 보낸 productId 를 그대로
           믿게 되어, 제일 싼 상품 영수증으로 최상위 등급을 받을 수 있다. */
        const transactions =
          (Array.isArray(data.latest_receipt_info) && data.latest_receipt_info.length
            ? data.latest_receipt_info
            : data.receipt?.in_app) ?? [];
        const matched = pickAppleTransaction(transactions, productId);
        if (!matched) {
          verifyMessage = "apple_product_mismatch";
          break;
        }
        const original = String(matched.original_transaction_id ?? matched.transaction_id ?? "").trim();
        if (!original) {
          verifyMessage = "apple_missing_transaction_id";
          break;
        }
        verified = true;
        verifyMessage = "apple_verified";
        transactionKey = original;
        verifiedExpiresAtMs = toMillis(matched.expires_date_ms);
        rawEvidence = { ...matched };
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
        const data = (await res.json()) as {
          paymentState?: number;
          purchaseState?: number;
          expiryTimeMillis?: string | number;
          orderId?: string;
        };
        /* purchaseState 0 = 구매완료. 1(취소)·2(보류)를 통과시키면 취소된 결제로
           플랜이 올라간다. 구독은 만료 시각도 함께 본다 — 지난 영수증을 다시
           내는 것만으로 유료 기간이 되살아나면 안 된다. */
        const stateOk = data.purchaseState === undefined || data.purchaseState === 0;
        const paid = data.paymentState === 1 || data.paymentState === 2;
        const expiryMs = toMillis(data.expiryTimeMillis);
        const notExpired = expiryMs !== null && expiryMs > Date.now();
        const key = String(data.orderId ?? "").trim() || receipt;
        if (!stateOk) verifyMessage = "google_purchase_state";
        else if (!paid) verifyMessage = "google_unpaid";
        else if (!notExpired) verifyMessage = "google_expired";
        else {
          verified = true;
          verifyMessage = "google_verified";
          transactionKey = key;
          verifiedExpiresAtMs = expiryMs;
          rawEvidence = { ...data };
        }
      }
    } else {
      verifyMessage = "google_token_missing";
    }
  }

  if (verified && !transactionKey) {
    /* 여기 오면 위 분기 중 하나가 거래 식별자 없이 verified 를 켰다는 뜻이다.
       결속할 수 없는 영수증은 검증되지 않은 것으로 취급한다. */
    verified = false;
    verifyMessage = "missing_transaction_key";
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
  /* 스토어가 알려 준 만료 시각이 진실이다. 없을 때만 상품 주기로 계산한다. */
  const periodEnd = verifiedExpiresAtMs ? new Date(verifiedExpiresAtMs) : new Date();
  if (!verifiedExpiresAtMs) {
    if (product.interval === "annual") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }
  }

  if (sb) {
    /* 플랜을 올리기 **전에** 영수증을 적재한다. (platform, transaction_key) 유니크
       제약이 "이 거래는 이미 썼다"를 DB 한 곳에서 결정하게 하는 자물쇠다 —
       앱 코드에서 먼저 조회하고 나중에 넣는 방식은 동시 요청 두 개가 같은
       영수증으로 둘 다 통과한다. 23505 는 재사용이므로 지급하지 않는다. */
    const { error: receiptError } = await sb.from("iap_receipts").insert({
      platform: platform === "ios" ? "apple" : "google",
      transaction_key: transactionKey,
      product_id: productId,
      user_email: email,
      expires_at: verifiedExpiresAtMs ? new Date(verifiedExpiresAtMs).toISOString() : null,
      raw: rawEvidence ?? { verifyMessage },
    });
    if (receiptError) {
      if (receiptError.code === "23505") {
        return NextResponse.json(
          { valid: false, error: "이미 사용된 영수증입니다.", platform, productId },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { valid: false, error: "영수증을 기록하지 못했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 },
      );
    }

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
      metadata: { productId, verifyMessage, transactionKey },
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
