import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { confirmTossOrder } from "@/lib/payments/confirm-toss-order";

export const runtime = "nodejs";

/**
 * 토스페이먼츠 결제 승인(confirm) — 얇은 HTTP 껍데기.
 *   - 실제 로직은 lib/payments/confirm-toss-order.ts (결제 완료 화면도 같은 함수를
 *     직접 부른다 — [965] 서버가 자기 API 를 HTTP 로 다시 부르던 구조를 없앴다).
 *   - `?mock=1` 쿼리가 오면 서버 결제 승인을 건너뛰고 성공 처리(개발용, 운영 거부)
 *   - 실제 운영: POST { paymentKey, orderId, amount }
 */
export async function POST(req: NextRequest) {
  /* 여기는 브라우저가 직접 부를 때만 온다 — IP 기준 제한이 맞다. */
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  const url = new URL(req.url);
  const mock = url.searchParams.get("mock") === "1";
  const body = (await req.json().catch(() => ({}))) as {
    paymentKey?: string;
    orderId?: string;
    amount?: number;
  };
  const orderId = body.orderId ?? url.searchParams.get("orderId") ?? undefined;
  if (!orderId) {
    return NextResponse.json({ error: "orderId missing" }, { status: 400 });
  }

  const session = await safeAuth();
  const result = await confirmTossOrder({
    orderId,
    paymentKey: body.paymentKey ?? null,
    amount: body.amount != null ? Number(body.amount) : null,
    currentEmail: session?.user?.email ?? null,
    mock,
  });
  return NextResponse.json(result.body, { status: result.status });
}
