import { NextRequest, NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { getPaymentByOrderId, markRefunded } from "@/lib/payments/store";
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
    // 주문번호로 매칭되면 환불 상태 반영(메모리/Supabase 공통).
    const orderNo = body.orderNo?.trim();
    if (orderNo) {
      const existing = await getPaymentByOrderId(orderNo);
      if (existing) await markRefunded({ orderId: orderNo, providerPaymentKey: payToken });
    }
    return NextResponse.json({ ok: true, refund: result.success });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
