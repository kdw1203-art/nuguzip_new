import "server-only";
import {
  getPaidPaymentByProviderKey,
  getPaymentByOrderId,
  markFailed,
  markPaid,
  promotePaidAfterProviderConfirmation,
  type PaymentRecord,
} from "@/lib/payments/store";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import { BILLING_DURATION_DAYS } from "@/lib/subscriptions/billing-periods";
import type { AppPlan } from "@/lib/billing/plan";
import { idempotencyKeyForOrder } from "@/lib/payments/idempotency";
import { logger } from "@/lib/log";

/**
 * 토스페이먼츠 단건 결제 승인(confirm) — 라우트(/api/payments/toss/confirm)와
 * 결제 완료 화면(/payment/success)이 **같은 함수**를 부른다.
 *
 * [965] 예전 결제 완료 화면은 서버 컴포넌트에서 자기 자신의 API 로 HTTP 를 한 번
 * 더 쐈다. 그 호출은
 *   · Host 헤더로 대상 주소를 만들었다 — 조작된 Host 면 paymentKey 를 남의 서버로
 *     보낸다(SSRF/유출).
 *   · 서버 IP 로 나가서 AUTH 속도 제한(5분 10회, fail-closed)의 **한 버킷**을 모든
 *     구매자가 나눠 썼다 — 11번째 결제부터 429, Redis 가 흔들리면 전원 429.
 *   · 세션 쿠키가 없어 본인 확인이 항상 비어 있었다.
 * 함수 호출이면 셋 다 없다.
 *
 * 상태 규칙:
 *   · 승인 요청은 orderId 기반 멱등키로 나간다(재시도해도 첫 응답).
 *   · 승인 API 가 실패/예외여도 곧바로 failed 로 적지 않는다 — 먼저 주문 조회
 *     (GET /v1/payments/orders/{orderId})로 실제 상태를 본다. DONE 이면 결제 완료다.
 *     "돈은 나갔는데 원장은 실패" 가 최악이라 판정 순서를 이렇게 둔다.
 *   · markPaid 가 null(=requested 가 아님)이면 결제사 확인을 근거로 어떤 상태에서든
 *     paid 로 조정한다(promotePaidAfterProviderConfirmation). `ok:true` 에 `payment:null`
 *     을 돌려주는 일은 없다 — 플랜을 못 켰으면 실패로 답한다.
 */
export type ConfirmTossOrderInput = {
  orderId: string;
  paymentKey?: string | null;
  /** successUrl 쿼리의 amount — 서버 저장 금액과 다르면 승인하지 않는다 */
  amount?: number | null;
  /** 로그인 세션의 이메일 — 있으면 주문 소유자와 대조 */
  currentEmail?: string | null;
  /** 개발용 목업 승인(운영에서는 거부) */
  mock?: boolean;
};

export type ConfirmTossOrderResult = {
  status: number;
  body: {
    ok?: boolean;
    payment?: PaymentRecord | null;
    alreadyPaid?: boolean;
    recovered?: boolean;
    mock?: boolean;
    error?: string;
    code?: string | null;
    toss?: Record<string, unknown>;
  };
};

const TOSS_API = "https://api.tosspayments.com/v1";

function basicAuth(secret: string): string {
  return `Basic ${Buffer.from(secret + ":").toString("base64")}`;
}

/** 운영 판정 — Vercel 프리뷰도 NODE_ENV=production 이라 VERCEL_ENV 를 먼저 본다 */
function isProductionRuntime(): boolean {
  const v = process.env.VERCEL_ENV?.trim();
  if (v) return v === "production";
  return process.env.NODE_ENV === "production";
}

export async function confirmTossOrder(input: ConfirmTossOrderInput): Promise<ConfirmTossOrderResult> {
  const orderId = input.orderId?.trim();
  if (!orderId) return { status: 400, body: { error: "orderId missing" } };
  const paymentKey = input.paymentKey?.trim() || null;

  if (paymentKey) {
    const paidByKey = await getPaidPaymentByProviderKey(paymentKey);
    if (paidByKey && paidByKey.orderId !== orderId) {
      return {
        status: 409,
        body: { error: "이미 사용된 결제 키입니다. 중복 승인 요청을 중단했습니다." },
      };
    }
  }

  const existing = await getPaymentByOrderId(orderId);
  if (!existing) return { status: 404, body: { error: "결제 요청을 찾을 수 없습니다." } };

  const currentEmail = input.currentEmail?.trim().toLowerCase() || null;
  if (existing.userEmail && currentEmail && existing.userEmail.toLowerCase() !== currentEmail) {
    return { status: 403, body: { error: "본인 결제만 승인할 수 있습니다." } };
  }
  if (existing.status === "paid") {
    if (paymentKey && existing.providerPaymentKey && paymentKey !== existing.providerPaymentKey) {
      return { status: 409, body: { error: "이미 완료된 결제의 결제 키와 일치하지 않습니다." } };
    }
    return { status: 200, body: { ok: true, payment: existing, alreadyPaid: true } };
  }
  if (existing.status === "refunded") {
    return { status: 409, body: { error: "환불된 주문은 다시 승인할 수 없습니다." } };
  }

  if (input.mock) {
    if (isProductionRuntime()) {
      return { status: 403, body: { error: "운영 환경에서는 mock 결제를 사용할 수 없습니다." } };
    }
    const paid = await markPaid({ orderId, providerPaymentKey: "MOCK-PAYMENT-KEY", method: "mock-card" });
    if (!paid) return { status: 409, body: { error: "승인 대기 상태가 아닌 주문입니다." } };
    await applyPlanForPayment(paid);
    return { status: 200, body: { ok: true, mock: true, payment: paid } };
  }

  const secret = process.env.TOSS_SECRET_KEY?.trim();
  if (!secret || !paymentKey) {
    /* 키 누락은 우리 쪽 설정 문제다 — 사용자 주문을 실패로 적지 않고 설정 오류로 답한다 */
    return {
      status: secret ? 400 : 503,
      body: { error: secret ? "paymentKey 가 없습니다." : "결제 승인 설정이 준비되지 않았습니다. 고객센터로 문의해 주세요." },
    };
  }

  if (input.amount != null && Number(input.amount) !== Number(existing.amount)) {
    await markFailed(orderId);
    return { status: 400, body: { error: "결제 금액 검증에 실패했습니다." } };
  }

  /* 운영 + 테스트 키는 경고만(토스 심사 절차가 이 상태를 요구한다 — 청구 없음) */
  if (isProductionRuntime() && secret.startsWith("test_")) {
    logger.warn(
      "[payments:toss] 운영 환경에서 테스트 키로 승인합니다 — 실제 출금 없음(심사용 설정). 라이브 전환 시 두 키를 함께 교체하세요.",
    );
  }
  /* 역방향 가드 — 개발/프리뷰에 라이브 키. [965] Vercel 프리뷰도 NODE_ENV=production
     이라 예전 판정(NODE_ENV)으로는 프리뷰에서 실카드가 청구될 수 있었다. */
  if (!isProductionRuntime() && secret.startsWith("live_")) {
    await markFailed(orderId);
    return {
      status: 500,
      body: {
        error:
          "운영이 아닌 환경에 토스 라이브 시크릿 키가 설정되어 결제를 중단했습니다. 테스트 키(test_sk_…)로 바꿔 주세요.",
      },
    };
  }
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim();
  if (clientKey && clientKey.startsWith("test_") !== secret.startsWith("test_")) {
    await markFailed(orderId);
    return {
      status: 500,
      body: {
        error:
          "토스 클라이언트 키와 시크릿 키의 환경(test/live)이 서로 다릅니다. 같은 환경의 키 짝으로 맞춰 주세요.",
      },
    };
  }

  try {
    const res = await fetch(`${TOSS_API}/payments/confirm`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(secret),
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKeyForOrder(orderId),
      },
      body: JSON.stringify({ paymentKey, orderId, amount: existing.amount }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      const recovered = await queryPaymentDone(secret, orderId);
      if (recovered) {
        const paid = await settlePaid(orderId, recovered, "confirm 실패 뒤 주문 조회 DONE");
        if (!paid) return unsettled(orderId);
        return { status: 200, body: { ok: true, payment: paid, recovered: true } };
      }
      await markFailed(orderId);
      const code = typeof data.code === "string" ? (data.code as string) : null;
      const friendly =
        code === "NOT_FOUND_PAYMENT_SESSION"
          ? "결제 진행 시간이 10분을 넘어 세션이 만료됐어요. 청구는 되지 않았으니 처음부터 다시 시도해 주세요."
          : code === "ALREADY_PROCESSED_PAYMENT"
            ? "이미 처리된 결제예요. 마이 페이지에서 플랜 상태를 확인해 주세요."
            : null;
      return {
        status: res.status,
        body: { error: friendly ?? ((data.message as string) ?? "toss confirm failed"), code, toss: data },
      };
    }

    const paid = await settlePaid(
      orderId,
      {
        paymentKey,
        method: typeof data.method === "string" ? (data.method as string) : undefined,
        receiptUrl:
          typeof data.receipt === "object" && data.receipt
            ? ((data.receipt as { url?: string }).url ?? undefined)
            : undefined,
      },
      "confirm 성공 — requested 가 아니던 주문",
    );
    if (!paid) return unsettled(orderId);
    return { status: 200, body: { ok: true, payment: paid } };
  } catch (e) {
    /* [965] 예외(타임아웃·소켓 끊김)는 "승인 안 됨" 이 아니라 "모름" 이다.
       먼저 주문을 조회해 DONE 이면 완료로, 아니면 그때 failed 로 적는다. */
    const recovered = await queryPaymentDone(secret, orderId);
    if (recovered) {
      const paid = await settlePaid(orderId, recovered, "confirm 예외 뒤 주문 조회 DONE");
      if (!paid) return unsettled(orderId);
      return { status: 200, body: { ok: true, payment: paid, recovered: true } };
    }
    await markFailed(orderId);
    logger.error("[payments:toss] confirm 예외", { orderId, message: e instanceof Error ? e.message : String(e) });
    return {
      status: 502,
      body: { error: "결제사 응답을 받지 못했어요. 청구 여부는 마이 페이지 결제 내역에서 확인해 주세요." },
    };
  }
}

function unsettled(orderId: string): ConfirmTossOrderResult {
  logger.error("[payments:toss] 승인은 확인됐는데 원장을 paid 로 만들지 못함", { orderId });
  return {
    status: 500,
    body: {
      error:
        "결제는 승인됐지만 이용권 반영에 실패했어요. 고객센터로 주문번호를 알려 주시면 바로 처리해 드립니다.",
      code: "LEDGER_UNSETTLED",
    },
  };
}

async function settlePaid(
  orderId: string,
  done: { paymentKey: string; method?: string; receiptUrl?: string },
  reason: string,
): Promise<PaymentRecord | null> {
  let paid = await markPaid({
    orderId,
    providerPaymentKey: done.paymentKey,
    method: done.method,
    receiptUrl: done.receiptUrl,
  });
  if (!paid) {
    paid = await promotePaidAfterProviderConfirmation({
      orderId,
      providerPaymentKey: done.paymentKey,
      method: done.method,
      receiptUrl: done.receiptUrl,
      reason,
    });
  }
  if (paid) await applyPlanForPayment(paid);
  return paid;
}

/**
 * GET /v1/payments/orders/{orderId} — status === "DONE" 이면 결제 정보, 그 외 null.
 */
export async function queryPaymentDone(
  secret: string,
  orderId: string,
): Promise<{ paymentKey: string; method?: string; receiptUrl?: string } | null> {
  try {
    const res = await fetch(`${TOSS_API}/payments/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: basicAuth(secret) },
    });
    if (!res.ok) return null;
    const d = (await res.json().catch(() => null)) as {
      status?: string;
      paymentKey?: string;
      method?: string;
      receipt?: { url?: string } | null;
    } | null;
    if (d?.status !== "DONE" || !d.paymentKey) return null;
    return {
      paymentKey: d.paymentKey,
      method: typeof d.method === "string" ? d.method : undefined,
      receiptUrl: d.receipt?.url ?? undefined,
    };
  } catch {
    return null;
  }
}

/** 결제 행의 플랜·주기대로 이용권을 켠다 — 주문 소유자 기준(세션이 아니라) */
export async function applyPlanForPayment(paid: PaymentRecord): Promise<void> {
  const userEmail = paid.userEmail?.trim().toLowerCase();
  if (!userEmail) {
    logger.error("[payments:toss] 결제 행에 소유자 이메일이 없어 플랜을 반영하지 못함", { orderId: paid.orderId });
    return;
  }
  /* tier === "basic" 은 단품 — 멤버십 등급을 바꾸지 않는다 */
  if (paid.plan === "basic") return;
  const appPlan: AppPlan = paid.plan;
  await applyPlanToUserByEmail(userEmail, appPlan, {
    durationDays: BILLING_DURATION_DAYS[paid.billing],
  });
}
