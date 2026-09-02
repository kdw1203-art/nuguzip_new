import { NextRequest, NextResponse } from "next/server";
import {
  getPaymentByOrderId,
  markCancelled,
  markPaid,
  markRefunded,
} from "@/lib/payments/store";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import type { AppPlan } from "@/lib/billing/plan";
import { markDeletedByBillingKey } from "@/lib/payments/billing-store";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

/**
 * 토스페이먼츠 웹훅 수신 (v2).
 *
 * 등록: developers.tosspayments.com → 내 개발정보 → 웹훅 → URL 에
 *   https://naezipnow.com/api/payments/toss/webhook
 * 구독 이벤트: PAYMENT_STATUS_CHANGED (전 결제수단) · DEPOSIT_CALLBACK (가상계좌)
 *   · BILLING_DELETED (자동결제 빌링키 삭제 — 빌링 운영 시 필수)
 *
 * 문서 근거 (docs.tosspayments.com/guides/v2/webhook · reference/using-api/webhook-events):
 *  - 10초 안에 200 을 돌려줘야 한다. 못 주면 최대 7회(약 3일 19시간) 재시도된다 —
 *    그래서 처리는 **멱등**해야 한다(같은 이벤트가 두 번 와도 상태가 두 번 바뀌지 않게).
 *  - PAYMENT_STATUS_CHANGED 페이로드에는 서명이 없다. **페이로드를 믿지 않는다** —
 *    orderId 만 꺼내고, 상태·금액은 시크릿 키로 결제 조회 API 를 다시 불러 확인한다.
 *    (웹훅 URL 을 아는 누구나 임의 JSON 을 보낼 수 있기 때문이다.)
 *  - DEPOSIT_CALLBACK(가상계좌)만 secret 필드가 있다 — 발급 응답의 secret 과
 *    대조해 검증한다. 우리는 아직 가상계좌를 발급하지 않으므로(결제위젯에서 미노출)
 *    이 이벤트는 기록만 남기고 200 을 준다(모르는 주문을 승인 처리하지 않는다).
 */

type TossPaymentObject = {
  paymentKey?: string;
  orderId?: string;
  status?: string;
  totalAmount?: number;
  method?: string;
  receipt?: { url?: string } | null;
};

async function fetchPaymentFromToss(paymentKey: string): Promise<TossPaymentObject | null> {
  const secret = process.env.TOSS_SECRET_KEY?.trim();
  if (!secret) return null;
  try {
    const res = await fetch(
      `https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as TossPaymentObject;
  } catch {
    return null;
  }
}

async function applyPlanIfNeeded(
  userEmail: string | null,
  tier: "basic" | "pro" | "expert" | "enterprise",
  billing: "weekly" | "monthly" | "annual",
): Promise<void> {
  if (!userEmail || tier === "basic") return;
  const plan: AppPlan = tier;
  await applyPlanToUserByEmail(userEmail, plan, {
    durationDays: billing === "annual" ? 365 : billing === "weekly" ? 7 : 30,
  });
}

export async function POST(req: NextRequest) {
  /* 어떤 경우에도 재시도 폭주를 만들지 않도록, 본문 파싱 실패도 200 으로 받는다
     (형식이 깨진 요청을 7회 재전송받아 봐야 달라질 게 없다). 처리 실패만 5xx. */
  const body = (await req.json().catch(() => null)) as {
    eventType?: string;
    createdAt?: string;
    data?: TossPaymentObject & { billingKey?: string };
    // DEPOSIT_CALLBACK 은 평평한 구조로 온다
    secret?: string;
    status?: string;
    orderId?: string;
    transactionKey?: string;
    // BILLING_DELETED 는 billingKey 가 최상위에 온다(웹훅 이벤트 문서)
    billingKey?: string;
  } | null;
  if (!body) return NextResponse.json({ ok: true, ignored: "unparsable" });

  const eventType = body.eventType ?? (body.transactionKey ? "DEPOSIT_CALLBACK" : "UNKNOWN");

  if (eventType === "DEPOSIT_CALLBACK") {
    /* 가상계좌 입금 통지 — 현재 위젯에서 가상계좌를 노출하지 않으므로 여기 도달할
       주문이 없어야 정상이다. 있어도 secret 검증 없이는 절대 승인하지 않는다.
       (발급을 시작하면: 발급 응답의 secret 을 payments.metadata 에 저장하고
        여기서 대조 → 일치 시에만 markPaid.) */
    logger.warn("[toss-webhook] DEPOSIT_CALLBACK 수신 — 가상계좌 미사용 상점", {
      orderId: body.orderId ?? null,
      status: body.status ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  if (eventType === "BILLING_DELETED") {
    /* 자동결제 빌링키가 토스 쪽에서 삭제됨(웹훅 이벤트 문서: eventType·createdAt·
       billingKey·reason). 페이로드에 서명이 없지만, billingKey 는 서버 저장소에만
       있는 값이라 **저장된 행과 일치하는 것 자체가 진위 확인**이다 — 일치하는 행이
       없으면 아무것도 바꾸지 않고 200 만 준다(탐색 시도에 정보를 주지 않는다).
       일치하면 구독을 deleted 로 접어 크론 청구를 멈추고, 카드 재등록을 안내한다. */
    const billingKey =
      (typeof body.billingKey === "string" ? body.billingKey : null) ??
      (typeof body.data?.billingKey === "string" ? (body.data.billingKey as string) : null);
    if (billingKey) {
      try {
        const sub = await markDeletedByBillingKey({ billingKey });
        if (sub) {
          logger.warn("[toss-webhook] BILLING_DELETED — 자동결제 중단", {
            subscription: sub.id,
          });
          await appendInboxNotification({
            userEmail: sub.userEmail,
            title: "자동결제 카드 등록이 해제됐어요",
            body: "등록된 카드가 삭제되어 자동결제가 멈췄어요. 계속 이용하려면 카드를 다시 등록해 주세요.",
            actionUrl: "/subscription/billing",
          }).catch(() => {});
        }
      } catch (e) {
        logger.error("[toss-webhook] BILLING_DELETED 반영 실패", e);
        return NextResponse.json({ error: "apply failed" }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (eventType !== "PAYMENT_STATUS_CHANGED") {
    // 구독하지 않은 이벤트 — 정상 수신으로 응답(재시도 불필요)
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  const payloadOrderId = body.data?.orderId?.trim();
  const payloadPaymentKey = body.data?.paymentKey?.trim();
  if (!payloadOrderId || !payloadPaymentKey) {
    return NextResponse.json({ ok: true, ignored: "missing-keys" });
  }

  // 우리가 만든 주문인지부터 — 모르는 주문은 기록 없이 200 (탐색 시도에 정보를 주지 않는다)
  const order = await getPaymentByOrderId(payloadOrderId);
  if (!order) return NextResponse.json({ ok: true });

  /* 신뢰 경계: 페이로드의 status/amount 를 쓰지 않고 결제 조회 API 로 재확인한다. */
  const remote = await fetchPaymentFromToss(payloadPaymentKey);
  if (!remote || remote.orderId !== payloadOrderId) {
    // 조회 실패는 우리 쪽 일시 장애일 수 있다 — 5xx 로 재시도를 받는다
    logger.error("[toss-webhook] 결제 재조회 실패 — 재시도 요청", {
      orderId: payloadOrderId,
    });
    return NextResponse.json({ error: "verify failed" }, { status: 500 });
  }

  const status = remote.status ?? "";
  try {
    if (status === "DONE") {
      // 금액 대조 — 승인 API 와 같은 기준. 다르면 절대 반영하지 않는다.
      if (Number(remote.totalAmount) !== Number(order.amount)) {
        logger.error("[toss-webhook] 금액 불일치 — 반영 거부", {
          orderId: payloadOrderId,
          expected: order.amount,
          got: remote.totalAmount,
        });
        return NextResponse.json({ ok: true, ignored: "amount-mismatch" });
      }
      if (order.status !== "paid") {
        const paid = await markPaid({
          orderId: payloadOrderId,
          providerPaymentKey: payloadPaymentKey,
          method: remote.method ?? undefined,
          receiptUrl: remote.receipt?.url ?? undefined,
        });
        if (paid) await applyPlanIfNeeded(paid.userEmail, paid.plan, paid.billing);
      }
    } else if (status === "CANCELED" || status === "PARTIAL_CANCELED") {
      if (order.status !== "refunded") {
        await markRefunded({ orderId: payloadOrderId });
      }
    } else if (status === "ABORTED" || status === "EXPIRED") {
      /* 결제창 만료·사용자 중단은 **거절이 아니다**. 예전엔 이 둘을 failed 로
         적어서 실패율 지표가 미완료 시도까지 실패로 셌다(2026-08-25 실측:
         "결제 실패 2건 / 시도 3건" critical — 둘 다 창을 닫은 건이었다). */
      if (order.status === "requested") await markCancelled(payloadOrderId);
    }
    // READY·IN_PROGRESS·WAITING_FOR_DEPOSIT 등 중간 상태는 기록 변경 없음
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[toss-webhook] 상태 반영 실패", {
      orderId: payloadOrderId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "apply failed" }, { status: 500 });
  }
}
