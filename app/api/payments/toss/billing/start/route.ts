import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { assertCheckoutAllowed } from "@/lib/payments/checkout-guard";
import { getPlan } from "@/lib/subscriptions/plans";
import { isTossBillingEnabled } from "@/lib/payments/toss-billing";
import { startPendingSubscription, getLiveSubscriptionByEmail } from "@/lib/payments/billing-store";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * 자동결제 카드 등록 시작 — 서버가 customerKey(무작위 UUID)를 발급한다.
 *
 * 빌링 문서: customerKey 는 이메일처럼 유추 가능한 값 금지, 무작위 고유값 필수.
 * 그래서 클라이언트가 만들지 않고 서버(DB gen_random_uuid)가 만들어 내려 준다.
 * 금액도 단건 결제(toss/create)와 같은 원칙 — 서버가 계산·저장하고, 클라이언트
 * 금액은 믿지 않는다.
 *
 * 주기는 월간·연간뿐이다. 주간권(1,100원)은 "단건 결제·자동 반복청구 없음"으로
 * 심사에 고지한 상품이라 자동결제 대상이 아니다 — weekly 요청은 400.
 */

type Body = { tier?: string; billing?: string; mode?: string };

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  if (!isTossBillingEnabled()) {
    /* 정직한 대기 — 전자계약 승인 전에는 등록을 받지 않는다(등록만 되고 승인이
       전부 거절되는 화면을 만들지 않는다). */
    return NextResponse.json(
      { error: "자동결제는 아직 준비 중이에요. 지금은 단건 결제를 이용해 주세요." },
      { status: 503 },
    );
  }

  const session = await safeAuth();
  const userEmail = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!userEmail) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  /* [965] 전자상거래법 고지 게이트 — 모든 유료 레일에 같은 문(lib/payments/checkout-guard) */
  const blocked = assertCheckoutAllowed("payments:toss:billing:start");
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as Body;

  /* 카드 변경(재등록) — 살아 있는 구독의 customerKey 를 그대로 내려 준다.
     새 pending 행을 만들지 않는다(만들면 첫 결제가 또 나간다). 실제 교체는
     register 콜백의 mode=card 분기에서 결제 없이 수행된다. */
  if (body.mode === "card") {
    const live = await getLiveSubscriptionByEmail(userEmail);
    if (!live) {
      return NextResponse.json(
        { error: "변경할 자동결제 구독이 없어요. 먼저 자동결제를 등록해 주세요." },
        { status: 404 },
      );
    }
    return NextResponse.json({
      customerKey: live.customerKey,
      amount: live.amount,
      mode: "card",
      plan: live.plan,
      billing: live.billing,
    });
  }

  const tier = body.tier === "pro" || body.tier === "expert" ? body.tier : null;
  const billing = body.billing === "annual" ? "annual" : body.billing === "monthly" ? "monthly" : null;
  if (!tier || !billing) {
    return NextResponse.json(
      { error: "자동결제는 플러스·프로 플랜의 월간/연간 주기만 지원해요." },
      { status: 400 },
    );
  }

  const planDef = getPlan(tier);
  const amount =
    billing === "annual" && planDef.priceAnnualMonthly
      ? planDef.priceAnnualMonthly * 12
      : planDef.priceMonthly;
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "결제 가능한 플랜이 아닙니다." }, { status: 400 });
  }

  try {
    const sub = await startPendingSubscription({ userEmail, plan: tier, billing, amount });
    /* billingKey 는 아직 없고, customerKey 는 requestBillingAuth 호출에 필요한
       본인 소유 값이라 내려 보낸다(다른 사용자의 키는 register 단계의 세션 대조가 막는다). */
    return NextResponse.json({
      customerKey: sub.customerKey,
      plan: sub.plan,
      billing: sub.billing,
      amount: sub.amount,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
