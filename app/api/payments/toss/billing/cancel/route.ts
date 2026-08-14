import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { deleteBillingKey } from "@/lib/payments/toss-billing";
import { cancelSubscription, getLiveSubscriptionByEmail } from "@/lib/payments/billing-store";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

/**
 * 자동결제 해지 — 본인 구독의 청구를 멈추고 등록 카드(빌링키)를 지운다.
 *
 * 이미 결제한 기간은 그대로 유지된다(plan_expires_at 까지 — 만료 스윕이 처리).
 * "해지했는데 이번 달 이용이 바로 끊기는" 동작은 환불 규정과 다른 얘기라 하지
 * 않는다. 환불은 기존 경로(약관 제8조·고객센터) 그대로.
 *
 * 빌링키 삭제(DELETE /v1/billing/{billingKey})까지 하는 이유: 해지한 사용자의
 * 카드 대체값을 우리 쪽에 계속 청구 가능 상태로 남겨 둘 이유가 없다. 삭제 API
 * 실패는 해지를 막지 않는다 — 로컬 상태가 canceled 면 크론이 청구하지 않는다.
 */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  const userEmail = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!userEmail) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const live = await getLiveSubscriptionByEmail(userEmail);
    if (!live) {
      return NextResponse.json({ error: "해지할 자동결제가 없어요." }, { status: 404 });
    }
    const canceled = await cancelSubscription({ userEmail });
    if (!canceled) {
      return NextResponse.json({ error: "해지 처리에 실패했어요. 다시 시도해 주세요." }, { status: 500 });
    }
    if (live.billingKey) {
      const del = await deleteBillingKey(live.billingKey);
      if (!del.ok) {
        // 로컬 해지는 이미 완료 — 삭제 실패는 기록만 (BILLING_DELETED 웹훅이 오면 멱등 흡수)
        logger.warn("[toss-billing] 빌링키 삭제 실패(해지는 완료)", {
          code: del.code,
          status: del.status,
        });
      }
    }
    return NextResponse.json({
      ok: true,
      message: "자동결제를 해지했어요. 이미 결제된 기간은 만료일까지 그대로 이용할 수 있어요.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
