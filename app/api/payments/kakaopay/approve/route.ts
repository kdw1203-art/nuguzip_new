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
import { getServiceSupabase } from "@/lib/supabase/service";
import { recordPlatformEvent } from "@/lib/platform-events";

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
  /* 카카오 인앱 브라우저·다른 컨텍스트로 돌아오면 세션 쿠키가 없을 수 있다 —
     그때는 소유자 대조를 건너뛴다(승인 자체는 tid+pg_token 소지가 조건이고,
     플랜은 주문 소유자에게 붙는다). 세션이 **있는데** 다른 사람이면 거절. */
  if (
    existing.userEmail &&
    currentEmail &&
    existing.userEmail.toLowerCase() !== currentEmail.toLowerCase()
  ) {
    return NextResponse.redirect(`${base}/payment/fail?reason=forbidden`);
  }

  /* [965] partner_user_id 는 ready 때 보낸 값과 **같아야** 승인된다. 예전엔 여기서
     다시 계산해(세션 id 우선) 인앱 브라우저처럼 세션이 비면 ready 와 다른 값이
     나가 승인이 거절됐다. ready 가 metadata 에 남긴 값을 그대로 쓴다. */
  const storedPartnerUserId =
    typeof existing.metadata?.partnerUserId === "string"
      ? (existing.metadata.partnerUserId as string)
      : null;
  const partnerUserId = (
    storedPartnerUserId ||
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

    /* 금액 검증은 fail-closed — 제공자가 승인 금액(amount.total)을 주지 않았거나
       숫자가 아니면 "검증 불가"이므로 통과가 아니라 실패로 처리한다. (카카오페이는
       실무상 항상 amount.total 을 주지만, 응답 변형 시 무검증 승인이 되면 안 된다.) */
    const approvedTotal = approved.amount?.total;
    if (
      approvedTotal == null ||
      !Number.isFinite(approvedTotal) ||
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

    if (paid) {
      await maybeApplyPlan(paid.userEmail, paid.plan, paid.billing);
      /* 항목 39 — ready 단계가 payments.metadata 에 저장한 source/campaign 을
         이행 시점의 plan_granted 이벤트로 옮겨 적는다. 결제 행과 요금제 부여가
         조인되지 않으면 "어떤 벽이 전환시켰는지"를 셀 수 없다. fail-soft. */
      await recordPlanGrantedSource(orderId, paid.userEmail, paid.plan);
    }

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
  billing: "weekly" | "monthly" | "annual",
): Promise<void> {
  if (!userEmail) return;
  if (tier === "basic") return;
  const appPlan: AppPlan = tier;
  // 카카오페이는 일회성 결제 — 결제 주기만큼만 이용 기간을 기록한다.
  // 만료 후 강등은 plan-expiry-sweep 크론이 처리한다.
  await applyPlanToUserByEmail(userEmail, appPlan, {
    durationDays: billing === "annual" ? 365 : billing === "weekly" ? 7 : 30,
  });
}

/**
 * 항목 39 — ready 단계가 payments.metadata 에 저장한 source/campaign 을
 * 요금제 부여 시점의 plan_granted 이벤트로 영속화. 실패해도 결제 흐름에는
 * 영향을 주지 않는다.
 */
async function recordPlanGrantedSource(
  orderId: string,
  userEmail: string | null,
  plan: string,
): Promise<void> {
  if (!userEmail) return;
  try {
    const sb = getServiceSupabase();
    if (!sb) return;
    const { data } = await sb
      .from("payments")
      .select("metadata")
      .eq("order_id", orderId)
      .maybeSingle();
    const meta = (data?.metadata ?? {}) as Record<string, unknown>;
    await recordPlatformEvent({
      /* 결제 승인 리다이렉트에는 단말 판별 근거가 없다 — desktop 기본값.
         출처 분석의 축은 source/campaign 이다. */
      platform: "desktop",
      eventName: "plan_granted",
      userEmail,
      source: String(meta.source ?? "") || null,
      campaign: String(meta.campaign ?? "") || null,
      metadata: { plan, rail: "kakaopay", orderId },
    });
  } catch (e) {
    logger.warn("[kakaopay:approve] plan_granted 이벤트 기록 실패", e);
  }
}
