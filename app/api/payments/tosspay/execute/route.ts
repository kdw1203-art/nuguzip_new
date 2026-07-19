import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import {
  getPaymentByOrderId,
  getPaidPaymentByProviderKey,
  markFailed,
  markPaid,
} from "@/lib/payments/store";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import type { AppPlan } from "@/lib/billing/plan";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import {
  executePayment,
  isTossPayConfigured,
  isTossPayLive,
  defaultTestUserKey,
} from "@/lib/payments/toss-pay";

export const runtime = "nodejs";

type Body = {
  payToken?: string;
  orderNo?: string;
  userKey?: string;
};

/**
 * 토스페이(Apps-in-Toss) 결제 실행(승인).
 *  - 클라이언트가 checkoutPayment 인증을 마친 뒤 payToken 으로 호출합니다.
 *  - 성공 시 payments 를 paid 로 표기하고 멤버십 등급을 적용합니다.
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
  const payToken = body.payToken?.trim();
  const orderNo = body.orderNo?.trim();
  if (!payToken || !orderNo) {
    return NextResponse.json(
      { error: "payToken·orderNo 가 필요합니다." },
      { status: 400 },
    );
  }

  const userKey = body.userKey?.trim() || defaultTestUserKey();
  if (!userKey) {
    return NextResponse.json(
      { error: "토스 사용자 인증 정보(userKey)가 필요합니다." },
      { status: 400 },
    );
  }

  const existing = await getPaymentByOrderId(orderNo);
  if (!existing) {
    return NextResponse.json({ error: "결제 요청을 찾을 수 없습니다." }, { status: 404 });
  }

  const session = await safeAuth();
  const currentEmail = session?.user?.email ?? null;
  if (existing.userEmail && currentEmail && existing.userEmail !== currentEmail) {
    return NextResponse.json({ error: "본인 결제만 승인할 수 있습니다." }, { status: 403 });
  }
  if (existing.providerPaymentKey && existing.providerPaymentKey !== payToken) {
    return NextResponse.json(
      { error: "결제 토큰이 주문과 일치하지 않습니다." },
      { status: 409 },
    );
  }
  if (existing.status === "paid") {
    return NextResponse.json({ ok: true, payment: existing, alreadyPaid: true });
  }
  const dupe = await getPaidPaymentByProviderKey(payToken);
  if (dupe && dupe.orderId !== orderNo) {
    return NextResponse.json(
      { error: "이미 사용된 결제 토큰입니다." },
      { status: 409 },
    );
  }

  try {
    const result = await executePayment({
      userKey,
      payToken,
      orderNo,
      isTestPayment: !isTossPayLive(),
    });
    if (result.resultType !== "SUCCESS" || !result.success) {
      await markFailed(orderNo);
      return NextResponse.json(
        { error: result.error?.reason || result.error?.msg || "토스페이 승인에 실패했습니다." },
        { status: 502 },
      );
    }
    const success = result.success;
    if (success.amount != null && Number(success.amount) !== Number(existing.amount)) {
      await markFailed(orderNo);
      return NextResponse.json({ error: "결제 금액 검증에 실패했습니다." }, { status: 400 });
    }

    const paid = await markPaid({
      orderId: orderNo,
      providerPaymentKey: payToken,
      method: success.payMethod ?? undefined,
      receiptUrl: success.salesCheckLinkUrl ?? undefined,
    });
    if (paid) await maybeApplyPlan(paid.userEmail, paid.plan);
    return NextResponse.json({ ok: true, payment: paid, toss: success });
  } catch (e) {
    await markFailed(orderNo);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}

async function maybeApplyPlan(
  userEmail: string | null,
  tier: "basic" | "pro" | "expert" | "enterprise",
): Promise<void> {
  if (!userEmail) {
    const session = await safeAuth();
    userEmail = session?.user?.email ?? null;
  }
  if (!userEmail) return;
  if (tier === "basic") return;
  const appPlan: AppPlan = tier;
  await applyPlanToUserByEmail(userEmail, appPlan);
}
