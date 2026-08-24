import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { createPayment, findRecentRequestedPayment } from "@/lib/payments/store";
import type { PlanTier } from "@/components/ui-kit";
import { getPlan } from "@/lib/subscriptions/plans";
import { WEEKLY_PASS } from "@/lib/subscriptions/billing-periods";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Body = {
  tier?: PlanTier;
  billing?: "weekly" | "monthly" | "annual";
  source?: string;
  campaign?: string;
  /** 유료 리포트 결제일 때의 대상 리포트. metadata 에 박아 결제를 그 리포트에 묶는다. */
  reportId?: string;
};

/** report_purchases 검증에서 쓰는 결속 값이라 형식(uuid)을 여기서 확정해 둔다. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  if (process.env.NODE_ENV === "production" && !process.env.TOSS_SECRET_KEY?.trim()) {
    return NextResponse.json(
      { error: "결제 서비스 설정이 누락되었습니다. 관리자에게 문의해 주세요." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const tier = body.tier;
  /* weekly 를 monthly 로 접어 넘기면 고른 것(1,100원 주간권)과 다른 상품
     (2,900원 월간)을 조용히 파는 셈이다 — 명시된 세 값만 받고 나머지는 monthly. */
  const billing: "weekly" | "monthly" | "annual" =
    body.billing === "annual" ? "annual" : body.billing === "weekly" ? "weekly" : "monthly";
  const source = body.source?.trim().slice(0, 80) || "subscriptions-page";
  const campaign = body.campaign?.trim().slice(0, 80) || "toss";
  if (!tier || !["basic", "pro", "expert", "enterprise"].includes(tier)) {
    return NextResponse.json({ error: "invalid tier" }, { status: 400 });
  }

  /* 리포트 결제는 "어느 리포트를 위한 돈인가"를 생성 시점에 못 박는다.
     이게 없으면 결제 1건이 리포트 전부를 여는 열쇠가 된다
     (app/api/reports/[id]/purchase 가 이 값을 대조한다). */
  const reportId = body.reportId?.trim() || null;
  if (reportId && !UUID_RE.test(reportId)) {
    return NextResponse.json({ error: "invalid reportId" }, { status: 400 });
  }

  const session = await safeAuth();
  const userEmail = session?.user?.email ?? null;
  if (!userEmail) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  /* 주간권은 플러스(pro) 전용 단건 상품 — 다른 등급의 주간 요청은 없는 상품이다.
     조용히 월간으로 바꾸지 않고 400 으로 거절한다. */
  if (billing === "weekly" && tier !== WEEKLY_PASS.tier) {
    return NextResponse.json(
      { error: "주간권은 플러스 플랜에만 있습니다." },
      { status: 400 },
    );
  }

  /* [토스 심사 보완 2026-08-24] 이 라우트는 **단건 결제 주문** 전용이다.
     정기(월간·연간) 구독은 빌링 결제창(requestBillingAuth → 빌링키) 경로만 판다 —
     화면(PlanCheckoutButton·CheckoutClient)에 이어 서버에서도 한 번 더 막아야
     옛 링크·직접 호출로 정기 상품이 단건 결제창에 실리는 일이 재발하지 않는다. */
  if (billing !== "weekly") {
    return NextResponse.json(
      {
        error:
          "월간·연간 구독은 자동결제(빌링) 카드 등록으로 진행합니다. /subscription/billing 에서 등록해 주세요.",
        code: "USE_BILLING_WINDOW",
      },
      { status: 400 },
    );
  }

  const planDef = getPlan(tier);
  const amount =
    billing === "weekly"
      ? WEEKLY_PASS.totalKrw
      : billing === "annual" && planDef.priceAnnualMonthly
        ? planDef.priceAnnualMonthly * 12
        : planDef.priceMonthly;
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return NextResponse.json({ error: "결제 가능한 플랜이 아닙니다." }, { status: 400 });
  }

  const recent = await findRecentRequestedPayment({
    userEmail,
    plan: tier,
    billing,
    amount,
    withinMinutes: 15,
    reportId,
  });
  if (recent) {
    return NextResponse.json({
      orderId: recent.orderId,
      amount: recent.amount,
      status: recent.status,
      reused: true,
    });
  }

  const orderId = `WOODONG-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  try {
    const rec = await createPayment({
      orderId,
      userEmail,
      plan: tier,
      billing,
      amount,
      metadata: { source, campaign, ...(reportId ? { reportId } : {}) },
    });
    return NextResponse.json({
      orderId: rec.orderId,
      amount: rec.amount,
      status: rec.status,
      reused: false,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
