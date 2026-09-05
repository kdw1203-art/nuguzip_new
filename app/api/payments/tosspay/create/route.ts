import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import type { PlanTier } from "@/components/ui-kit";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { isTossPayConfigured } from "@/lib/payments/toss-pay";

export const runtime = "nodejs";

type Body = {
  tier?: PlanTier;
  billing?: "monthly" | "annual";
  /** 토스 로그인으로 획득한 userKey (Apps-in-Toss 환경에서 클라이언트가 전달). */
  userKey?: string;
  source?: string;
  campaign?: string;
};

/**
 * 토스페이(Apps-in-Toss) 결제 생성 — [965] 레일 닫힘.
 *
 * 부르는 화면이 하나도 없는 채로 열려 있었고, 월간·연간을 **단건**으로 파는 유일한
 * 경로였다 — 토스 단건 결제(toss/create)가 같은 상품을 거절하는 것(정기 상품은
 * 빌링창, 단건은 주간권)과 어긋나고, 클라이언트가 보낸 userKey 를 세션과 대조
 * 없이 그대로 썼다. 화면이 생기면 userKey 는 서버가 세션에서 매핑해 열어야 한다.
 * (execute/status/refund 는 이미 만들어진 결제의 사후 처리용이라 남긴다 — 본인
 * 확인은 fail-closed 로 고쳤다.)
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

  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const billing = body.billing === "annual" ? "annual" : "monthly";
  return NextResponse.json(
    {
      error: "토스페이 간편결제는 현재 열려 있지 않아요. 구독 페이지의 결제 버튼을 이용해 주세요.",
      code: "RAIL_CLOSED",
      billing,
    },
    { status: 503 },
  );
}
