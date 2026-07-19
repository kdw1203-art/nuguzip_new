import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { createPayment, findRecentRequestedPayment } from "@/lib/payments/store";
import type { PlanTier } from "@/components/ui-kit";
import { getPlan } from "@/lib/subscriptions/plans";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Body = {
  tier?: PlanTier;
  billing?: "monthly" | "annual";
  source?: string;
  campaign?: string;
};

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
  const billing = body.billing === "annual" ? "annual" : "monthly";
  const source = body.source?.trim().slice(0, 80) || "subscriptions-page";
  const campaign = body.campaign?.trim().slice(0, 80) || "toss";
  if (!tier || !["basic", "pro", "expert", "enterprise"].includes(tier)) {
    return NextResponse.json({ error: "invalid tier" }, { status: 400 });
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

  const recent = await findRecentRequestedPayment({
    userEmail,
    plan: tier,
    billing,
    amount,
    withinMinutes: 15,
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
      metadata: { source, campaign },
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
