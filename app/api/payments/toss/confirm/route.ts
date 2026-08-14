import { NextRequest, NextResponse } from "next/server";
import { getPaidPaymentByProviderKey, getPaymentByOrderId, markFailed, markPaid } from "@/lib/payments/store";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import type { AppPlan } from "@/lib/billing/plan";
import { safeAuth } from "@/lib/safe-auth";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { createHash } from "node:crypto";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

/**
 * 주문 하나에 늘 같은 멱등키를 만든다 (UUID v5 형태, 네임스페이스는 고정 문자열).
 *
 * 난수를 쓰면 재시도마다 키가 달라져 멱등성이 성립하지 않는다. orderId 로부터
 * 결정적으로 뽑아야 "같은 주문의 두 번째 승인 요청"이 첫 응답을 그대로 받는다.
 */
function idempotencyKeyForOrder(orderId: string): string {
  const h = createHash("sha1").update(`nuguzip:toss:confirm:${orderId}`).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
    if (paid) await maybeApplyPlan(paid.userEmail, paid.plan, paid.billing);
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
    /* 운영 + 테스트 키는 **경고만 남기고 통과**시킨다.
       원래는 여기서 끊었다 — 운영에 테스트 키가 꽂혀 있으면 승인은 성공하는데
       돈이 오지 않아, 화면상 멀쩡한 채로 매출만 새는 사고가 되기 때문이다.
       그런데 토스 상점 심사가 정확히 이 상태를 요구한다: 심사 안내가 "테스트
       API키를 발급받고 신용카드 결제창 연동을 완료하세요"라고 명시하고, 심사역이
       운영 도메인에서 테스트 결제를 끝까지 돌려 본다. 여기서 끊으면 심사를
       통과할 방법이 없다. 테스트 키 승인은 가상이라(청구 없음) 돈이 잘못
       나가는 사고는 애초에 불가능하고, 진짜 위험(짝 불일치·개발에 라이브 키)은
       아래 두 가드가 그대로 막는다. 라이브 전환 후 테스트 키가 남아 있는 실수는
       이 경고 로그로 발견한다. */
    if (process.env.NODE_ENV === "production" && secret.startsWith("test_")) {
      logger.warn(
        "[payments:toss] 운영 환경에서 테스트 키로 승인합니다 — 실제 출금 없음(심사용 설정). 라이브 전환 시 두 키를 함께 교체하세요.",
      );
    }
    /* 역방향 가드 — 개발/프리뷰에 라이브 키가 꽂힌 경우. 테스트 키 승인은
       가상이지만(청구 없음 — 토스 환경 가이드), 라이브 키 승인은 **실제로
       돈이 나간다**. 개발 중 실카드로 테스트하다 실청구되는 사고를 여기서 끊는다. */
    if (process.env.NODE_ENV !== "production" && secret.startsWith("live_")) {
      await markFailed(orderId);
      return NextResponse.json(
        {
          error:
            "개발 환경에 토스 라이브 시크릿 키가 설정되어 결제를 중단했습니다. 테스트 키(test_sk_…)로 바꿔 주세요.",
        },
        { status: 500 },
      );
    }
    /* 키 짝 검증 — 클라이언트 키(test_ck_)와 시크릿 키(live_sk_)의 환경이
       어긋나면 결제창은 뜨는데 승인만 실패한다. 토스 오류로 헤매기 전에
       원인을 문장으로 준다. */
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim();
    if (clientKey && clientKey.startsWith("test_") !== secret.startsWith("test_")) {
      await markFailed(orderId);
      return NextResponse.json(
        {
          error:
            "토스 클라이언트 키와 시크릿 키의 환경(test/live)이 서로 다릅니다. 같은 환경의 키 짝으로 맞춰 주세요.",
        },
        { status: 500 },
      );
    }

    const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
        "Content-Type": "application/json",
        /* 멱등키 — 같은 주문의 승인 요청이 두 번 나가도 첫 응답을 돌려받는다.
           successUrl 로 돌아온 화면에서 사용자가 새로고침하거나 네트워크가
           끊겼다 재시도되면 승인이 두 번 나갈 수 있다. 주문 하나당 같은 키를
           쓰도록 orderId 로 UUID v5 를 만든다(재시도해도 같은 키가 나온다).
           토스 기준 멱등키는 첫 요청 후 15일간 유효하다. */
        "Idempotency-Key": idempotencyKeyForOrder(orderId),
      },
      body: JSON.stringify({
        paymentKey: body.paymentKey,
        orderId,
        amount: existing.amount,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      /* LLM Quick Reference §8: confirm 실패를 곧바로 결제 실패로 단정하지
         않는다 — 이전 승인이 성공했는데 응답만 유실된 경우 재시도 confirm 이
         오류로 돌아올 수 있다(멱등키가 대부분 막지만 15일 만료·경계 사례가
         있다). 조회 API 로 실제 상태를 확인해 DONE 이면 결제 완료로 처리한다.
         과금이 이미 된 결제를 실패로 기록하는 것이 최악의 결과이기 때문이다. */
      const recovered = await queryPaymentDone(secret, orderId);
      if (recovered) {
        const paid = await markPaid({
          orderId,
          providerPaymentKey: recovered.paymentKey,
          method: recovered.method,
          receiptUrl: recovered.receiptUrl,
        });
        if (paid) await maybeApplyPlan(paid.userEmail, paid.plan, paid.billing);
        return NextResponse.json({ ok: true, payment: paid, recovered: true });
      }
      await markFailed(orderId);
      /* 코어 API 문서의 대표 실패를 사용자 문장으로 바꾼다. 특히
         NOT_FOUND_PAYMENT_SESSION 은 "승인 대기 10분 초과" 라는 명확한 원인이
         있는데 토스 원문만 보여 주면 사용자가 카드 문제로 오해한다. */
      const code = typeof data.code === "string" ? (data.code as string) : null;
      const friendly =
        code === "NOT_FOUND_PAYMENT_SESSION"
          ? "결제 진행 시간이 10분을 넘어 세션이 만료됐어요. 청구는 되지 않았으니 처음부터 다시 시도해 주세요."
          : code === "ALREADY_PROCESSED_PAYMENT"
            ? "이미 처리된 결제예요. 마이 페이지에서 플랜 상태를 확인해 주세요."
            : null;
      return NextResponse.json(
        { error: friendly ?? ((data.message as string) ?? "toss confirm failed"), code, toss: data },
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
    if (paid) await maybeApplyPlan(paid.userEmail, paid.plan, paid.billing);
    return NextResponse.json({ ok: true, payment: paid });
  } catch (e) {
    await markFailed(orderId);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}

/**
 * confirm 실패 시 실제 결제 상태 조회 — GET /v1/payments/orders/{orderId}.
 * status === "DONE" 이면 결제 정보를 돌려주고, 그 외(미결제·실패·조회 오류)는
 * null. 조회 자체가 실패해도 confirm 실패 처리 흐름을 막지 않는다.
 */
async function queryPaymentDone(
  secret: string,
  orderId: string,
): Promise<{ paymentKey: string; method?: string; receiptUrl?: string } | null> {
  try {
    const res = await fetch(
      `https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
        },
      },
    );
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

async function maybeApplyPlan(
  userEmail: string | null,
  tier: "basic" | "pro" | "expert" | "enterprise",
  billing: "weekly" | "monthly" | "annual",
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
  // 토스는 일회성 결제 — 결제 주기만큼만 이용 기간을 기록한다 (만료는 스윕 크론).
  await applyPlanToUserByEmail(userEmail, appPlan, {
    durationDays: billing === "annual" ? 365 : billing === "weekly" ? 7 : 30,
  });
}
