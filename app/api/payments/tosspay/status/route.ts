import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getPaymentByOrderId } from "@/lib/payments/store";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import {
  getPaymentStatus,
  isTossPayConfigured,
  isTossPayLive,
  defaultTestUserKey,
} from "@/lib/payments/toss-pay";

export const runtime = "nodejs";

type Body = { payToken?: string; orderNo?: string; userKey?: string };

/** 토스페이(Apps-in-Toss) 결제 상태 조회. */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  if (!isTossPayConfigured()) {
    return NextResponse.json(
      { error: "토스페이가 설정되지 않았습니다. (TOSSPAY_API_KEY)" },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const payToken = body.payToken?.trim();
  const orderNo = body.orderNo?.trim();
  if (!payToken || !orderNo) {
    return NextResponse.json({ error: "payToken·orderNo 가 필요합니다." }, { status: 400 });
  }

  const userKey = body.userKey?.trim() || defaultTestUserKey();
  if (!userKey) {
    return NextResponse.json(
      { error: "토스 사용자 인증 정보(userKey)가 필요합니다." },
      { status: 400 },
    );
  }

  const existing = await getPaymentByOrderId(orderNo);
  const session = await safeAuth();
  const currentEmail = session?.user?.email ?? null;
  /* [965] fail-closed — 비로그인(currentEmail=null)이면 예전 조건은 그냥 통과했다.
     주문 소유자가 있는 결제는 그 소유자의 세션에서만 다룬다. */
  if (existing?.userEmail && existing.userEmail.toLowerCase() !== (currentEmail ?? "").toLowerCase()) {
    return NextResponse.json({ error: "본인 결제만 조회할 수 있습니다." }, { status: 403 });
  }

  try {
    const result = await getPaymentStatus({
      userKey,
      payToken,
      orderNo,
      isTestPayment: !isTossPayLive(),
    });
    if (result.resultType !== "SUCCESS" || !result.success) {
      return NextResponse.json(
        { error: result.error?.reason || result.error?.msg || "상태 조회에 실패했습니다." },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, status: result.success });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
