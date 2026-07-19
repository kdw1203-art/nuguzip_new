import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { createPayment } from "@/lib/payments/store";
import type { PlanTier } from "@/components/ui-kit";
import { getPlan } from "@/lib/subscriptions/plans";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import {
  isTossPayConfigured,
  isTossPayLive,
  makePayment,
  defaultTestUserKey,
} from "@/lib/payments/toss-pay";

export const runtime = "nodejs";

type Body = {
  tier?: PlanTier;
  billing?: "monthly" | "annual";
  /** 토스 로그인으로 획득한 userKey (Apps-in-Toss 환경에서 클라이언트가 전달). */
  userKey?: string;
  source?: string;
  campaign?: string;
};

/**
 * 토스페이(Apps-in-Toss) 결제 생성.
 *  - 서버에서 makePayment 를 호출해 payToken 을 발급받고 payments 에 기록합니다.
 *  - 인증/승인은 클라이언트 SDK(checkoutPayment) → /api/payments/tosspay/execute 로 이어집니다.
 */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  if (!isTossPayConfigured()) {
    return NextResponse.json(
      { error: "토스페이가 설정되지 않았습니다. (TOSSPAY_API_KEY)" },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const tier = body.tier;
  const billing = body.billing === "annual" ? "annual" : "monthly";
  const source = body.source?.trim().slice(0, 80) || "pricing-tosspay";
  const campaign = body.campaign?.trim().slice(0, 80) || "tosspay";
  if (!tier || !["basic", "pro", "expert", "enterprise"].includes(tier)) {
    return NextResponse.json({ error: "invalid tier" }, { status: 400 });
  }

  const userKey = body.userKey?.trim() || defaultTestUserKey();
  if (!userKey) {
    return NextResponse.json(
      { error: "토스 사용자 인증 정보(userKey)가 필요합니다." },
      { status: 400 },
    );
  }

  const session = await safeAuth();
  const userEmail = session?.user?.email ?? null;
  if (!userEmail) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const planDef = getPlan(tier);
  const amount =
    billing === "annual" && planDef.priceAnnualMonthly
      ? planDef.priceAnnualMonthly * 12
      : planDef.priceMonthly;
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return NextResponse.json({ error: "결제 가능한 플랜이 아닙니다." }, { status: 400 });
  }

  // orderNo: 숫자/영문/`_-:.^@` 50자 이내
  const orderNo = `WOODONG-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const isTestPayment = !isTossPayLive();

  try {
    const made = await makePayment({
      userKey,
      orderNo,
      productDesc: `${planDef.name} 구독 (${billing === "annual" ? "연" : "월"})`.slice(0, 255),
      amount,
      amountTaxFree: 0,
      cashReceipt: false,
      isTestPayment,
    });
    if (made.resultType !== "SUCCESS" || !made.success?.payToken) {
      return NextResponse.json(
        { error: made.error?.reason || made.error?.msg || "토스페이 결제 생성에 실패했습니다." },
        { status: 502 },
      );
    }

    const payToken = made.success.payToken;
    await createPayment({
      orderId: orderNo,
      userEmail,
      plan: tier,
      billing,
      amount,
      provider: "tosspay",
      providerPaymentKey: payToken,
      metadata: { source, campaign, isTestPayment },
    });

    return NextResponse.json({
      payToken,
      orderNo,
      amount,
      isTestPayment,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
