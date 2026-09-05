import { NextRequest, NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { getPaidPaymentByProviderKey, markRefunded } from "@/lib/payments/store";
import { logger } from "@/lib/log";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import {
  refundPayment,
  isTossPayConfigured,
  isTossPayLive,
  defaultTestUserKey,
} from "@/lib/payments/toss-pay";

export const runtime = "nodejs";

type Body = { payToken?: string; orderNo?: string; reason?: string; userKey?: string };

/**
 * 토스페이(Apps-in-Toss) 결제 환불 — 관리자 전용.
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

  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const payToken = body.payToken?.trim();
  const reason = body.reason?.trim();
  if (!payToken || !reason) {
    return NextResponse.json({ error: "payToken·reason 이 필요합니다." }, { status: 400 });
  }

  const userKey = body.userKey?.trim() || defaultTestUserKey();
  if (!userKey) {
    return NextResponse.json(
      { error: "토스 사용자 인증 정보(userKey)가 필요합니다." },
      { status: 400 },
    );
  }

  try {
    const result = await refundPayment({
      userKey,
      payToken,
      reason,
      isTestPayment: !isTossPayLive(),
    });
    if (result.resultType !== "SUCCESS" || !result.success) {
      return NextResponse.json(
        { error: result.error?.reason || result.error?.msg || "환불에 실패했습니다." },
        { status: 502 },
      );
    }
    /* [965] 원장은 **payToken 으로 찾은 주문**만 환불 처리한다. 예전엔 요청 본문의
       orderNo 를 그대로 믿어, A 를 환불하고 B 를 refunded 로 적어 B 소유자의 플랜을
       회수할 수 있었다(환불된 건과 원장이 어긋난다). */
    const byToken = await getPaidPaymentByProviderKey(payToken);
    const orderNo = body.orderNo?.trim();
    if (byToken) {
      if (orderNo && orderNo !== byToken.orderId) {
        logger.warn("[tosspay/refund] 요청 orderNo 가 payToken 의 주문과 달라 payToken 기준으로 처리", {
          requested: orderNo,
          actual: byToken.orderId,
        });
      }
      await markRefunded({ orderId: byToken.orderId, providerPaymentKey: payToken });
    } else {
      logger.warn("[tosspay/refund] payToken 에 해당하는 paid 주문이 없어 원장을 갱신하지 않음");
    }
    return NextResponse.json({ ok: true, refund: result.success });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
