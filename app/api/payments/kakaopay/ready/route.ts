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
import {
  getBusinessInfo,
  isBusinessDisclosureComplete,
} from "@/lib/brand/business-info";

export const runtime = "nodejs";

type Body = {
  tier?: string;
  billing?: "monthly" | "annual";
  itemName?: string;
  quantity?: number;
  source?: string;
  campaign?: string;
};

const PLAN_TIERS = ["basic", "pro", "expert", "enterprise"] as const;

/**
 * 클라이언트가 보낸 tier 를 **먼저** 정규화하고, 아는 플랜이 아니면 거절한다.
 *
 * 예전에는 `["basic",...].includes(body.tier)` 라는 대소문자 구분 검사를 통과하지
 * 못하면 그냥 건너뛰고 `body.totalAmount` 를 그대로 청구했다. 그래서 `"Expert"` 처럼
 * 케이스만 바꿔 보내면 금액 계산 분기를 피해 1원을 결제할 수 있었고, 승인 이후
 * 플랜 반영은 normalizePlan(lib/billing/plan.ts)이 소문자로 접어 EXPERT 를 줬다.
 * 지금은 정규화가 먼저이므로 검사와 청구가 같은 값을 본다.
 */
function normalizeTier(raw: unknown): PlanTier | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return (PLAN_TIERS as readonly string[]).includes(s) ? (s as PlanTier) : null;
}

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

  if (!isBusinessDisclosureComplete(getBusinessInfo())) {
    logger.warn("[kakaopay:ready] 사업자 고지 미완 — 결제 차단");
    return NextResponse.json(
      {
        error:
          "사업자·통신판매업 고지가 완료되기 전에는 결제를 시작할 수 없어요. 고객센터로 문의해 주세요.",
        code: "business_disclosure_incomplete",
      },
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
  /* 주간권(weekly)은 토스 단건 상품 — 카카오페이에는 없다. 조용히 월간으로
     접으면 1,100원을 고른 사람에게 2,900원을 청구하게 되므로 거절한다. */
  if ((body.billing as string) === "weekly") {
    return NextResponse.json(
      { error: "주간권은 토스 카드 결제로만 구매할 수 있어요." },
      { status: 503 },
    );
  }
  const billing = body.billing === "annual" ? "annual" : "monthly";
  const source = body.source?.trim().slice(0, 80) || "pricing";
  const campaign = body.campaign?.trim().slice(0, 80) || "kakaopay";
  const quantity =
    typeof body.quantity === "number" && body.quantity > 0
      ? Math.floor(body.quantity)
      : 1;

  const tier = normalizeTier(body.tier);
  if (!tier) {
    return NextResponse.json({ error: "invalid tier" }, { status: 400 });
  }

  /* 금액은 **서버의 플랜 정의에서만** 나온다. 예전에는 body.totalAmount 를 받아
     그대로 청구했는데, 결제 금액을 결정하는 값을 결제하는 쪽에서 받는 구조라
     "1원 결제 후 EXPERT 승격" 이 성립했다. 그 경로는 통째로 삭제했다. */
  const planDef = getPlan(tier);
  const totalAmount =
    billing === "annual" && planDef.priceAnnualMonthly
      ? planDef.priceAnnualMonthly * 12
      : planDef.priceMonthly;
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
    return NextResponse.json({ error: "결제 가능한 플랜이 아닙니다." }, { status: 400 });
  }

  /* itemName 은 화면 표기용이라 클라이언트 값을 받아도 되지만, 길이는 잘라 둔다. */
  const itemName =
    body.itemName?.trim().slice(0, 100) ||
    `누구집 ${planDef.name} (${billing === "annual" ? "연간" : "월간"})`;

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
