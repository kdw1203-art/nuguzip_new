import { NextRequest, NextResponse } from "next/server";
import { getPaidPaymentByProviderKey, getPaymentByOrderId, markFailed, markPaid } from "@/lib/payments/store";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import type { AppPlan } from "@/lib/billing/plan";
import { safeAuth } from "@/lib/safe-auth";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * 토스페이먼츠 결제 승인(confirm).
 *   - `?mock=1` 쿼리가 오면 서버 결제 승인을 건너뛰고 성공 처리(개발용)
 *   - 실제 운영: POST { paymentKey, orderId, amount } 로 Toss Confirm API 호출
 */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  const mock = url.searchParams.get("mock") === "1";
  const body = (await req.json().catch(() => ({}))) as {
    paymentKey?: string;
    orderId?: string;
    amount?: number;
  };
  const queryOrderId = url.searchParams.get("orderId") ?? undefined;
  const orderId = body.orderId ?? queryOrderId;

  if (!orderId) {
    return NextResponse.json({ error: "orderId missing" }, { status: 400 });
  }

  if (body.paymentKey) {
    const paidByKey = await getPaidPaymentByProviderKey(body.paymentKey);
    if (paidByKey && paidByKey.orderId !== orderId) {
      return NextResponse.json(
        { error: "이미 사용된 결제 키입니다. 중복 승인 요청을 중단했습니다." },
        { status: 409 },
      );
    }
  }

  const existing = await getPaymentByOrderId(orderId);
  if (!existing) {
    return NextResponse.json({ error: "결제 요청을 찾을 수 없습니다." }, { status: 404 });
  }

  const session = await safeAuth();
  const currentEmail = session?.user?.email ?? null;
  if (existing.userEmail && currentEmail && existing.userEmail !== currentEmail) {
    return NextResponse.json({ error: "본인 결제만 승인할 수 있습니다." }, { status: 403 });
  }
  if (existing.status === "paid") {
    if (body.paymentKey && existing.providerPaymentKey && body.paymentKey !== existing.providerPaymentKey) {
      return NextResponse.json(
        { error: "이미 완료된 결제의 결제 키와 일치하지 않습니다." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, payment: existing, alreadyPaid: true });
  }

  if (mock) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "운영 환경에서는 mock 결제를 사용할 수 없습니다." },
        { status: 403 },
      );
    }
    const paid = await markPaid({
      orderId,
      providerPaymentKey: "MOCK-PAYMENT-KEY",
      method: "mock-card",
    });
    if (paid) await maybeApplyPlan(paid.userEmail, paid.plan);
    return NextResponse.json({ ok: true, mock: true, payment: paid });
  }

  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret || !body.paymentKey) {
    await markFailed(orderId);
    return NextResponse.json(
      { error: "Toss 비밀키 또는 paymentKey 누락" },
      { status: 400 },
    );
  }

  try {
    if (body.amount != null && Number(body.amount) !== Number(existing.amount)) {
      await markFailed(orderId);
      return NextResponse.json(
        { error: "결제 금액 검증에 실패했습니다." },
        { status: 400 },
      );
    }
    const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentKey: body.paymentKey,
        orderId,
        amount: existing.amount,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      await markFailed(orderId);
      return NextResponse.json(
        { error: (data.message as string) ?? "toss confirm failed", toss: data },
        { status: res.status },
      );
    }
    const paid = await markPaid({
      orderId,
      providerPaymentKey: body.paymentKey,
      method: typeof data.method === "string" ? (data.method as string) : undefined,
      receiptUrl:
        typeof data.receipt === "object" && data.receipt
          ? ((data.receipt as { url?: string }).url ?? undefined)
          : undefined,
    });
    if (paid) await maybeApplyPlan(paid.userEmail, paid.plan);
    return NextResponse.json({ ok: true, payment: paid });
  } catch (e) {
    await markFailed(orderId);
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
  // tier === "basic" 은 무료 플랜 또는 단품 결제(Group Pass 등) 로 간주하여
  // 멤버십 등급을 변경하지 않는다.
  if (tier === "basic") return;
  const appPlan: AppPlan = tier;
  await applyPlanToUserByEmail(userEmail, appPlan);
}
