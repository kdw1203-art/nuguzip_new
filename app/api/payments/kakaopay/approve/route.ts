import { NextRequest, NextResponse } from "next/server";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import type { AppPlan } from "@/lib/billing/plan";
import { approveKakaoPay, isKakaoPayConfigured } from "@/lib/payments/kakaopay";
import {
  getPaidPaymentByProviderKey,
  getPaymentByOrderId,
  markFailed,
  markPaid,
} from "@/lib/payments/store";
import { safeAuth } from "@/lib/safe-auth";
import { desktopBaseUrl, resolvePublicOriginFromHeaders } from "@/lib/platform-shell";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

function appOrigin(req: NextRequest): string {
  try {
    return resolvePublicOriginFromHeaders(req.headers);
  } catch {
    return desktopBaseUrl();
  }
}

/**
 * 카카오페이 approval_url 콜백.
 * PC는 팝업/레이어에서 pg_token 과 함께 리다이렉트됩니다.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("order_id")?.trim();
  const pgToken = url.searchParams.get("pg_token")?.trim();
  const base = appOrigin(req);

  if (!orderId || !pgToken) {
    return NextResponse.redirect(`${base}/payment/fail?reason=missing_params`);
  }

  if (!isKakaoPayConfigured()) {
    return NextResponse.redirect(`${base}/payment/fail?reason=not_configured`);
  }

  const existing = await getPaymentByOrderId(orderId);
  if (!existing) {
    return NextResponse.redirect(`${base}/payment/fail?orderId=${encodeURIComponent(orderId)}`);
  }

  const session = await safeAuth();
  const currentEmail = session?.user?.email ?? null;
  if (existing.userEmail && currentEmail && existing.userEmail !== currentEmail) {
    return NextResponse.redirect(`${base}/payment/fail?reason=forbidden`);
  }

  const partnerUserId = (
    session?.user?.id ||
    existing.userEmail ||
    orderId
  ).slice(0, 100);

  if (existing.status === "paid") {
    return NextResponse.redirect(
      `${base}/payment/success?orderId=${encodeURIComponent(orderId)}&provider=kakaopay`,
    );
  }

  const tid = existing.providerPaymentKey;
  if (!tid) {
    await markFailed(orderId);
    return NextResponse.redirect(`${base}/payment/fail?orderId=${encodeURIComponent(orderId)}`);
  }

  const paidByTid = await getPaidPaymentByProviderKey(tid);
  if (paidByTid && paidByTid.orderId !== orderId) {
    return NextResponse.redirect(`${base}/payment/fail?reason=duplicate_tid`);
  }

  try {
    const approved = await approveKakaoPay({
      tid,
      partnerOrderId: orderId,
      partnerUserId: String(partnerUserId).slice(0, 100),
      pgToken,
    });

    const approvedTotal = approved.amount?.total;
    if (
      approvedTotal != null &&
      Number.isFinite(approvedTotal) &&
      approvedTotal !== existing.amount
    ) {
      await markFailed(orderId);
      return NextResponse.redirect(`${base}/payment/fail?reason=amount_mismatch`);
    }

    const paid = await markPaid({
      orderId,
      providerPaymentKey: tid,
      method: approved.payment_method_type ?? "kakaopay",
    });

    if (paid) await maybeApplyPlan(paid.userEmail, paid.plan, paid.billing);

    return NextResponse.redirect(
      `${base}/payment/success?orderId=${encodeURIComponent(orderId)}&provider=kakaopay`,
    );
  } catch (e) {
    logger.error("[kakaopay:approve]", e);
    await markFailed(orderId);
    return NextResponse.redirect(
      `${base}/payment/fail?orderId=${encodeURIComponent(orderId)}&provider=kakaopay`,
    );
  }
}

async function maybeApplyPlan(
  userEmail: string | null,
  tier: "basic" | "pro" | "expert" | "enterprise",
  billing: "monthly" | "annual",
): Promise<void> {
  if (!userEmail) return;
  if (tier === "basic") return;
  const appPlan: AppPlan = tier;
  // 카카오페이는 일회성 결제 — 결제 주기만큼만 이용 기간을 기록한다.
  // 만료 후 강등은 plan-expiry-sweep 크론이 처리한다.
  await applyPlanToUserByEmail(userEmail, appPlan, {
    durationDays: billing === "annual" ? 365 : 30,
  });
}
