import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { createPayment, findRecentRequestedPayment } from "@/lib/payments/store";
import { getGroupPass } from "@/lib/subscriptions/group-passes";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Body = {
  passId?: "basic" | "pro";
};

/**
 * 모임 패스(Group Pass) 단품 결제 요청 생성.
 *   - 멤버십(plan) 업그레이드는 일으키지 않고, 모임 개설 권한만 부여하기 위한 별도 레코드를 만든다.
 *   - `metadata.product = "group_pass_basic" | "group_pass_pro"` 로 구분되며,
 *     결제 확정 시에도 멤버십 플랜은 그대로 유지된다.
 */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  if (process.env.NODE_ENV === "production" && !process.env.TOSS_SECRET_KEY?.trim()) {
    return NextResponse.json(
      { error: "결제 서비스 설정이 누락되었습니다. 관리자에게 문의해 주세요." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const passId = body.passId;
  if (passId !== "basic" && passId !== "pro") {
    return NextResponse.json({ error: "invalid passId" }, { status: 400 });
  }

  const session = await safeAuth();
  const userEmail = session?.user?.email ?? null;
  if (!userEmail) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const amount = getGroupPass(passId).priceMonthly;
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return NextResponse.json({ error: "결제 가능한 패스가 아닙니다." }, { status: 400 });
  }

  const recent = await findRecentRequestedPayment({
    userEmail,
    plan: "basic",
    billing: "monthly",
    amount,
    withinMinutes: 15,
  });
  if (recent) {
    return NextResponse.json({
      orderId: recent.orderId,
      amount: recent.amount,
      status: recent.status,
      reused: true,
    });
  }

  const orderId = `WDPASS-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  try {
    const rec = await createPayment({
      orderId,
      userEmail,
      // 멤버십 플랜이 아닌 별도 상품 — tier 는 정책상 "basic" 으로 두어 구독 등급 변경이 일어나지 않게 한다.
      plan: "basic",
      billing: "monthly",
      amount,
      metadata: {
        source: "pricing-group-pass",
        product: passId === "basic" ? "group_pass_basic" : "group_pass_pro",
        passId,
      },
    });
    return NextResponse.json({
      orderId: rec.orderId,
      amount: rec.amount,
      status: rec.status,
      reused: false,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
