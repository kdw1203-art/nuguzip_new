import { NextResponse } from "next/server";
import { planLabel } from "@/lib/subscriptions/labels";
import { authorizeCron } from "@/lib/cron/authorize";
import {
  chargeBillingKey,
  deterministicIdempotencyKey,
  isNonRetryableBillingCode,
  isTossBillingConfigured,
} from "@/lib/payments/toss-billing";
import {
  listDueSubscriptions,
  recordRenewalFailure,
  recordRenewalSuccess,
  type BillingSubscription,
} from "@/lib/payments/billing-store";
import { createPayment, getPaymentByOrderId, markFailed, markPaid } from "@/lib/payments/store";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import type { AppPlan } from "@/lib/billing/plan";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 자동결제 갱신 크론 — 토스는 스케줄러를 제공하지 않는다(빌링 문서 명시).
 * 호출원: pg_cron(ops.run_billing_renewals, 10:10·22:10 KST) + Vercel 크론
 * (vercel.json). vault cron_secret 이 없어도 Vercel 쪽은 CRON_SECRET Bearer 로
 * 청구를 돌린다. pg_cron 경보를 끄려면 vault 등록이 필요하다.
 *
 * 이중 청구 불가 구조(세 겹):
 *  1) 멱등키 = 구독 id + 이번 주기(next_charge_at) — 크론이 겹쳐 돌아도 토스가
 *     같은 응답을 돌려준다(승인 API 멱등키, 15일 유효).
 *  2) 주기당 orderId 도 결정적으로 만들어 payments 원장에서 재사용 검사.
 *  3) 성공 시 next_charge_at 을 전진시키므로 다음 조회에서 빠진다.
 *
 * 실패 처리(빌링 문서의 "실패 시 새 카드 등록 유도"):
 *  - 재시도 가능(잔액 부족·일시 오류): fail_count 증가, 다음 크론이 재시도.
 *  - 재시도 무의미(빌링키 삭제·정지 카드 등) 또는 3회 연속 실패: suspended 로
 *    접고 인앱 알림으로 카드 재등록을 안내한다. 이용권은 만료 스윕이 기간 종료
 *    시점에 정상 강등한다 — 여기서 즉시 뺏지 않는다.
 */

/* 상품명은 결제 내역·영수증에 그대로 남는다 — 단일 출처를 쓴다. */
const MAX_CONSECUTIVE_FAILS = 3;
const BATCH = 10;

async function renewOne(sub: BillingSubscription): Promise<"charged" | "failed" | "suspended"> {
  const cycle = sub.nextChargeAt ?? "unknown-cycle";
  /* 주기 고정 orderId — 같은 주기 재시도는 같은 주문을 재사용한다(이미 paid 면 skip) */
  const orderId = `BILLING-${deterministicIdempotencyKey(`nuguzip:toss:billing:order:${sub.id}:${cycle}`).slice(0, 23).toUpperCase()}`;
  const existing = await getPaymentByOrderId(orderId);
  if (existing?.status === "paid") {
    // 승인은 성공했는데 next_charge_at 전진 전에 죽었던 경우 — 전진만 마저 한다
    const periodDays = sub.billing === "annual" ? 365 : 30;
    const base = sub.nextChargeAt ? new Date(sub.nextChargeAt).getTime() : Date.now();
    await recordRenewalSuccess({
      id: sub.id,
      nextChargeAt: new Date(base + periodDays * 86_400_000).toISOString(),
      lastOrderId: orderId,
    });
    return "charged";
  }
  if (!existing) {
    await createPayment({
      orderId,
      userEmail: sub.userEmail,
      plan: sub.plan,
      billing: sub.billing,
      amount: sub.amount,
      provider: "toss-billing",
      metadata: { billingSubscriptionId: sub.id, cycle },
    });
  }

  const charged = await chargeBillingKey({
    billingKey: sub.billingKey as string,
    customerKey: sub.customerKey,
    amount: sub.amount,
    orderId,
    orderName: `누구집 ${planLabel(sub.plan)} ${sub.billing === "annual" ? "연간" : "월간"} 자동결제 갱신`,
    customerEmail: sub.userEmail,
    idempotencyKey: deterministicIdempotencyKey(`nuguzip:toss:billing:${sub.id}:${cycle}`),
  });

  if (!charged.ok) {
    await markFailed(orderId);
    const suspend =
      isNonRetryableBillingCode(charged.code) || sub.failCount + 1 >= MAX_CONSECUTIVE_FAILS;
    await recordRenewalFailure({
      id: sub.id,
      error: `${charged.code ?? "UNKNOWN"}: ${charged.message}`,
      suspend,
    });
    if (suspend) {
      try {
        await appendInboxNotification({
          userEmail: sub.userEmail,
          title: "자동결제 갱신에 실패했어요",
          body: "등록된 카드로 결제가 되지 않아 자동결제를 잠시 멈췄어요. 카드를 다시 등록하면 이어서 이용할 수 있어요.",
          actionUrl: "/subscription/billing",
        });
      } catch (e) {
        logger.warn("[billing-renewals] 실패 알림 발송 실패", e);
      }
      return "suspended";
    }
    return "failed";
  }

  if (charged.data.totalAmount != null && Number(charged.data.totalAmount) !== sub.amount) {
    // 승인 금액이 우리 장부와 다르면 반영하지 않고 사람 확인 대상으로 남긴다
    logger.error("[billing-renewals] 갱신 금액 불일치", {
      subscription: sub.id,
      expected: sub.amount,
      got: charged.data.totalAmount,
    });
    await recordRenewalFailure({ id: sub.id, error: "AMOUNT_MISMATCH", suspend: true });
    return "suspended";
  }

  await markPaid({
    orderId,
    providerPaymentKey: charged.data.paymentKey,
    method: "카드(자동결제)",
  });
  const periodDays = sub.billing === "annual" ? 365 : 30;
  await applyPlanToUserByEmail(sub.userEmail, sub.plan as AppPlan, { durationDays: periodDays });
  const base = sub.nextChargeAt ? new Date(sub.nextChargeAt).getTime() : Date.now();
  await recordRenewalSuccess({
    id: sub.id,
    nextChargeAt: new Date(base + periodDays * 86_400_000).toISOString(),
    lastOrderId: orderId,
  });
  return "charged";
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  if (!isTossBillingConfigured()) {
    return NextResponse.json({ ok: true, note: "TOSS_SECRET_KEY 미설정 — 갱신 없음" });
  }

  try {
    const due = await listDueSubscriptions(BATCH);
    let charged = 0;
    let failed = 0;
    let suspended = 0;
    for (const sub of due) {
      try {
        const r = await renewOne(sub);
        if (r === "charged") charged += 1;
        else if (r === "suspended") suspended += 1;
        else failed += 1;
      } catch (e) {
        failed += 1;
        logger.error("[billing-renewals] 갱신 처리 예외", {
          subscription: sub.id,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }
    if (due.length > 0) {
      await logIngest({
        source: "billing-renewals",
        dataset: "billing_subscriptions",
        origin: "cron-fetch",
        rows: charged,
        status: failed + suspended > 0 && charged === 0 ? "error" : "ok",
        message: `갱신 ${charged}건 · 재시도 예정 ${failed}건 · 중단 ${suspended}건 (대상 ${due.length}건)`,
      });
    }
    return NextResponse.json({ ok: true, due: due.length, charged, failed, suspended });
  } catch (e) {
    logger.error("[billing-renewals]", e);
    await logIngest({
      source: "billing-renewals",
      dataset: "billing_subscriptions",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message: ingestErrorMessage(e),
    }).catch(() => {});
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "renewal failed" },
      { status: 500 },
    );
  }
}
