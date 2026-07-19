import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import {
  createPayment,
  findRecentRequestedPayment,
  setPaymentProviderKey,
} from "@/lib/payments/store";
import {
  createKakaoPayReady,
  isKakaoPayConfigured,
} from "@/lib/payments/kakaopay";
import type { PlanTier } from "@/components/ui-kit";
import { getPlan } from "@/lib/subscriptions/plans";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { desktopBaseUrl, resolvePublicOriginFromHeaders } from "@/lib/platform-shell";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

type Body = {
  tier?: PlanTier;
  billing?: "monthly" | "annual";
  itemName?: string;
  quantity?: number;
  /** 단건 금액(원). tier 없이 커스텀 상품 결제 시 사용. */
  totalAmount?: number;
  source?: string;
  campaign?: string;
};

function appOrigin(req: NextRequest): string {
  try {
    return resolvePublicOriginFromHeaders(req.headers);
  } catch {
    return desktopBaseUrl();
  }
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  if (!isKakaoPayConfigured()) {
    return NextResponse.json(
      { error: "카카오페이 설정(KAKAOPAY_CID, KAKAOPAY_SECRET_KEY)이 없습니다." },
      { status: 503 },
    );
  }

  const session = await safeAuth();
  const userEmail = session?.user?.email ?? null;
  if (!session?.user?.email || !userEmail) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const partnerUserId = (session.user.id || userEmail).slice(0, 100);

  const body = (await req.json().catch(() => ({}))) as Body;
  const billing = body.billing === "annual" ? "annual" : "monthly";
  const source = body.source?.trim().slice(0, 80) || "pricing";
  const campaign = body.campaign?.trim().slice(0, 80) || "kakaopay";
  const quantity =
    typeof body.quantity === "number" && body.quantity > 0
      ? Math.floor(body.quantity)
      : 1;

  let tier: PlanTier = body.tier ?? "pro";
  let itemName = body.itemName?.trim();
  let totalAmount = body.totalAmount;

  if (body.tier && ["basic", "pro", "expert", "enterprise"].includes(body.tier)) {
    tier = body.tier;
    const planDef = getPlan(tier);
    totalAmount =
      billing === "annual" && planDef.priceAnnualMonthly
        ? planDef.priceAnnualMonthly * 12
        : planDef.priceMonthly;
    if (!itemName) {
      itemName = `우리동네이야기 ${planDef.name} (${billing === "annual" ? "연간" : "월간"})`;
    }
  }

  if (!itemName || !Number.isFinite(totalAmount) || !totalAmount || totalAmount <= 0) {
    return NextResponse.json(
      { error: "itemName 과 totalAmount(또는 tier) 가 필요합니다." },
      { status: 400 },
    );
  }

  const recent = await findRecentRequestedPayment({
    userEmail,
    plan: tier,
    billing,
    amount: totalAmount,
    withinMinutes: 15,
  });
  if (recent?.provider === "kakaopay" && recent.providerPaymentKey) {
    return NextResponse.json({
      orderId: recent.orderId,
      tid: recent.providerPaymentKey,
      amount: recent.amount,
      reused: true,
      message: "진행 중인 카카오페이 요청이 있습니다. 승인 URL을 다시 열어 주세요.",
    });
  }

  const orderId = `KP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const base = appOrigin(req);
  const approvalUrl = `${base}/api/payments/kakaopay/approve?order_id=${encodeURIComponent(orderId)}`;
  const cancelUrl = `${base}/api/payments/kakaopay/cancel?order_id=${encodeURIComponent(orderId)}`;
  const failUrl = `${base}/api/payments/kakaopay/fail?order_id=${encodeURIComponent(orderId)}`;

  try {
    await createPayment({
      orderId,
      userEmail,
      plan: tier,
      billing,
      amount: totalAmount,
      provider: "kakaopay",
      metadata: { source, campaign, partnerUserId },
    });

    const ready = await createKakaoPayReady({
      orderId,
      userId: partnerUserId,
      itemName,
      quantity,
      totalAmount,
      approvalUrl,
      cancelUrl,
      failUrl,
    });

    await setPaymentProviderKey({
      orderId,
      providerPaymentKey: ready.tid,
    });

    return NextResponse.json({
      orderId,
      tid: ready.tid,
      amount: totalAmount,
      nextRedirectPcUrl: ready.next_redirect_pc_url ?? null,
      nextRedirectMobileUrl: ready.next_redirect_mobile_url ?? null,
      nextRedirectAppUrl: ready.next_redirect_app_url ?? null,
      reused: false,
    });
  } catch (e) {
    logger.error("[kakaopay:ready]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "카카오페이 준비 실패" },
      { status: 500 },
    );
  }
}
