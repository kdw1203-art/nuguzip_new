import { NextRequest, NextResponse } from "next/server";
import {
  getPaymentByOrderId,
  markFailed,
  markPaid,
  markRefunded,
} from "@/lib/payments/store";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import type { AppPlan } from "@/lib/billing/plan";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

/**
 * 토스페이먼츠 웹훅 수신 (v2).
 *
 * 등록: developers.tosspayments.com → 내 개발정보 → 웹훅 → URL 에
 *   https://nuguzip.com/api/payments/toss/webhook
 * 구독 이벤트: PAYMENT_STATUS_CHANGED (전 결제수단) · DEPOSIT_CALLBACK (가상계좌)
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
    data?: TossPaymentObject;
    // DEPOSIT_CALLBACK 은 평평한 구조로 온다
    secret?: string;
    status?: string;
    orderId?: string;
    transactionKey?: string;
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
      if (order.status === "requested") await markFailed(payloadOrderId);
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
