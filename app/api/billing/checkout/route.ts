import { NextResponse } from "next/server";
import { createSubscriptionCheckout } from "@/lib/billing/stripe-checkout";
import { getStripe } from "@/lib/billing/stripe";
import {
  getBusinessInfo,
  isBusinessDisclosureComplete,
} from "@/lib/brand/business-info";
import { desktopBaseUrl, resolvePublicOriginFromHeaders } from "@/lib/platform-shell";
import { safeAuth } from "@/lib/safe-auth";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

function appOriginFromRequest(req: Request): string {
  try {
    return resolvePublicOriginFromHeaders(req.headers);
  } catch {
    return desktopBaseUrl();
  }
}

export async function POST(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  /* 전자상거래법: 주소·통신판매업 고지 미완이면 유료 결제창을 열지 않는다 */
  if (!isBusinessDisclosureComplete(getBusinessInfo())) {
    logger.warn("[billing:checkout] 사업자 고지 미완 — 결제 차단");
    return NextResponse.json(
      {
        error:
          "사업자·통신판매업 고지가 완료되기 전에는 결제를 시작할 수 없어요. 고객센터로 문의해 주세요.",
        code: "business_disclosure_incomplete",
      },
      { status: 503 },
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    // 503 본문은 사용자에게 그대로 보여줄 수 있는 문구로 — 환경변수 이름 같은
    // 내부 사정은 로그에만 남긴다 (PlanCheckoutButton 이 이 문구를 노출한다).
    logger.warn("[billing:checkout] STRIPE_SECRET_KEY 미설정 — 카드 결제 비활성");
    return NextResponse.json(
      { error: "카드 결제가 아직 준비되지 않았어요. 다른 결제 수단으로 시도해 주세요." },
      { status: 503 },
    );
  }

  let plan: "pro" | "expert" | "enterprise" = "pro";
  let billing: "monthly" | "annual" = "monthly";
  let source = "pricing";
  let campaign = "stripe_alt";
  try {
    const j = (await req.json()) as {
      plan?: string;
      billing?: string;
      source?: string;
      campaign?: string;
    };
    if (j?.plan === "expert") plan = "expert";
    else if (j?.plan === "enterprise") plan = "enterprise";
    if (j?.billing === "annual") billing = "annual";
    if (typeof j.source === "string" && j.source.trim()) source = j.source.trim().slice(0, 80);
    if (typeof j.campaign === "string" && j.campaign.trim()) campaign = j.campaign.trim().slice(0, 80);
  } catch {
    /* default pro */
  }

  /**
   * 결제 주기별 Price ID.
   *
   * ⚠️ 예전에는 `billing` 을 아예 파싱하지 않았다. /subscription 에서 "연간"을 고르면
   *    화면은 연간 할인가를 보여 주는데 여기로 넘어온 뒤 조용히 월간 Price ID 로
   *    결제창이 열렸다 — 고른 것과 다른 상품을 파는 셈이다. 값을 조용히 바꾸느니
   *    503 으로 멈추는 쪽이 옳다. 연간 Price ID 환경변수가 붙으면 그대로 동작한다.
   */
  const monthlyPriceEnv =
    plan === "enterprise"
      ? "STRIPE_PRICE_ENTERPRISE"
      : plan === "expert"
        ? "STRIPE_PRICE_EXPERT"
        : "STRIPE_PRICE_PRO";
  const priceEnv = billing === "annual" ? `${monthlyPriceEnv}_ANNUAL` : monthlyPriceEnv;
  const priceId = process.env[priceEnv]?.trim();
  if (!priceId) {
    logger.warn(`[billing:checkout] ${priceEnv} 미설정 — ${plan}/${billing} 카드 결제 비활성`);
    return NextResponse.json(
      {
        error:
          billing === "annual"
            ? "연간 카드 결제 상품이 아직 등록되지 않았어요. 월간 결제로 진행해 주세요."
            : "카드 결제가 아직 준비되지 않았어요. 다른 결제 수단으로 시도해 주세요.",
      },
      { status: 503 },
    );
  }

  const base = appOriginFromRequest(req);
  const email = session.user.email!;
  const userId = session.user.id || email;

  try {
    const checkout = await createSubscriptionCheckout({
      userId,
      email,
      priceId,
      plan,
      source,
      campaign,
      successUrl: `${base}/payment/success?provider=stripe&session_id={CHECKOUT_SESSION_ID}&source=${encodeURIComponent(source)}&campaign=${encodeURIComponent(campaign)}`,
      // plan/billing 을 실어 보내야 실패 페이지의 "다시 시도하기"가 고른 상품을 기억한다
      cancelUrl: `${base}/payment/fail?provider=stripe&checkout=cancel&plan=${plan}&billing=${billing}&source=${encodeURIComponent(source)}&campaign=${encodeURIComponent(campaign)}`,
    });
    if (!checkout.url) {
      return NextResponse.json(
        { error: "Checkout URL 을 받지 못했습니다." },
        { status: 500 },
      );
    }
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    logger.error("[billing:checkout]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Checkout 생성 실패" },
      { status: 500 },
    );
  }
}
