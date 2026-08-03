import { NextRequest, NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { getPaymentByOrderId, markRefunded } from "@/lib/payments/store";
import { cancelTossPayment } from "@/lib/payments/toss-cancel";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan-from-stripe";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

/**
 * 관리자 결제 취소(전액 환불) — 청약철회(7일) 처리 수단.
 *
 * 구독 FAQ 가 "7일 이내 청약철회"를 약속하는데 처리 경로가 없었다(빈 약속).
 * 흐름: paid 상태의 토스 결제만 → 토스 취소 API(멱등키) → refunded 기록 →
 * 결제로 부여했던 플랜을 free 로 되돌림.
 *
 * 안전장치:
 *  - 관리자 세션 필수(isAdminApiRequest).
 *  - 이미 refunded 면 그대로 성공 응답(멱등 — 버튼 이중클릭·재시도 안전).
 *  - 토스 취소가 실패하면 우리 장부는 건드리지 않는다 — "토스는 아직
 *    결제 상태인데 장부만 환불"이 되는 순간 정산이 어긋난다.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    orderId?: string;
    reason?: string;
  };
  const orderId = body.orderId?.trim();
  const reason = body.reason?.trim() || "고객 요청 환불(관리자 처리)";
  if (!orderId) return NextResponse.json({ error: "orderId 누락" }, { status: 400 });

  const record = await getPaymentByOrderId(orderId);
  if (!record) return NextResponse.json({ error: "결제 기록이 없습니다." }, { status: 404 });
  if (record.status === "refunded") {
    return NextResponse.json({ ok: true, alreadyRefunded: true });
  }
  if (record.status !== "paid") {
    return NextResponse.json(
      { error: `취소는 결제완료(paid) 건만 가능합니다 (현재: ${record.status}).` },
      { status: 409 },
    );
  }
  if (!record.providerPaymentKey || record.providerPaymentKey === "MOCK-PAYMENT-KEY") {
    return NextResponse.json(
      { error: "PG 결제 키가 없는 기록이라 토스 취소를 보낼 수 없습니다." },
      { status: 409 },
    );
  }

  const cancel = await cancelTossPayment({
    paymentKey: record.providerPaymentKey,
    orderId,
    cancelReason: reason,
  });
  if (!cancel.ok) {
    /* ALREADY_CANCELED_PAYMENT — 토스에서는 이미 취소됐는데 장부만 남은 경우.
       이때는 장부를 따라잡는 게 맞다(웹훅 유실 등). 그 외 실패는 장부 불변. */
    if (cancel.code !== "ALREADY_CANCELED_PAYMENT") {
      logger.error("[admin/payments/cancel] 토스 취소 실패", {
        orderId,
        code: cancel.code,
        message: cancel.message,
      });
      return NextResponse.json(
        { error: `토스 취소 실패: ${cancel.message}`, code: cancel.code },
        { status: 502 },
      );
    }
  }

  const refunded = await markRefunded({ orderId });
  if (!refunded) {
    // 토스는 취소됐는데 장부 갱신 실패 — 웹훅(CANCELED) 재수신이 따라잡는다
    logger.error("[admin/payments/cancel] 장부 갱신 실패 — 웹훅이 보정 예정", { orderId });
    return NextResponse.json(
      { error: "토스 취소는 완료됐지만 장부 갱신에 실패했습니다. 잠시 후 웹훅이 반영합니다." },
      { status: 500 },
    );
  }

  // 결제로 부여한 플랜 회수 — basic(단품)은 플랜 변경이 없었으므로 제외
  if (refunded.userEmail && refunded.plan !== "basic") {
    try {
      await applyPlanToUserByEmail(refunded.userEmail, "free");
    } catch (e) {
      logger.error("[admin/payments/cancel] 플랜 회수 실패", {
        orderId,
        err: e instanceof Error ? e.message : String(e),
      });
      // 환불 자체는 완료 — 플랜 회수 실패만 알린다
      return NextResponse.json({
        ok: true,
        warning: "환불은 완료됐지만 플랜 회수에 실패했습니다. 회원 관리에서 확인해 주세요.",
      });
    }
  }

  return NextResponse.json({ ok: true });
}
