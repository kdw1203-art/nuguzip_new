import { NextRequest, NextResponse } from "next/server";
import { getPaymentByOrderId, markFailed } from "@/lib/payments/store";
import { safeAuth } from "@/lib/safe-auth";
import { desktopBaseUrl, resolvePublicOriginFromHeaders } from "@/lib/platform-shell";

export const runtime = "nodejs";

/**
 * 카카오페이 결제 실패 복귀 URL. 사용자의 브라우저가 돌아오는 자리라 GET 이다.
 *
 * order_id 는 **쿼리스트링**, 즉 요청자가 아무 값이나 넣을 수 있는 값이다. 예전에는
 * 세션도 소유자 확인도 없이 그 값으로 service-role 클라이언트가 markFailed 를 불렀다.
 * 주문번호만 알면(또는 찍어 맞히면) 남의 결제를 실패로 만들 수 있는 상태였다.
 * 지금은 로그인 세션의 이메일과 결제 행의 소유자가 같을 때만 상태를 바꾼다.
 * 확인에 실패해도 화면 이동은 그대로 해 준다 — 사용자에게 보일 것은 실패 안내뿐이고,
 * 여기서 막아야 하는 것은 "남의 장부를 고치는 일" 이다.
 */
export async function GET(req: NextRequest) {
  const base = (() => {
    try {
      return resolvePublicOriginFromHeaders(req.headers);
    } catch {
      return desktopBaseUrl();
    }
  })();
  const orderId = new URL(req.url).searchParams.get("order_id");
  if (orderId) {
    const session = await safeAuth();
    const userEmail = session?.user?.email?.toLowerCase() ?? null;
    if (userEmail) {
      const payment = await getPaymentByOrderId(orderId);
      if (payment?.userEmail?.toLowerCase() === userEmail) {
        await markFailed(orderId);
      }
    }
  }
  const q = orderId
    ? `?orderId=${encodeURIComponent(orderId)}&provider=kakaopay`
    : "?provider=kakaopay";
  return NextResponse.redirect(`${base}/payment/fail${q}`);
}
