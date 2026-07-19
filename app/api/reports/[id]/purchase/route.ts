/**
 * POST /api/reports/[id]/purchase
 * 유료 리포트 구매 처리
 *
 * 1. 이미 구매한 경우 → 200 already_purchased
 * 2. 무료 리포트 → 무조건 접근 가능
 * 3. PRO/EXPERT 플랜 월 무료 열람 처리
 * 4. 일반 결제(paymentId 전달 시) → createPurchase 저장
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getReport } from "@/lib/reports/store-db";
import { hasPurchased, createPurchase } from "@/lib/report-purchases/store-db";
import { checkAccess } from "@/lib/subscriptions/access";
import { resolveQuotaPlan } from "@/lib/subscriptions/usage-summary";
import {
  getPaidPaymentByProviderKey,
  getPaymentByOrderId,
} from "@/lib/payments/store";
import { applyRateLimit, AUTH_RATE_LIMIT, READ_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "리포트를 찾을 수 없습니다." }, { status: 404 });

  // 무료 리포트는 누구나
  if (!report.isPremium || report.price === 0) {
    return NextResponse.json({ access: true, reason: "free" });
  }

  // 본인 리포트
  if (report.authorId === session.user.email) {
    return NextResponse.json({ access: true, reason: "owner" });
  }

  // 이미 구매했는지 확인
  const purchased = await hasPurchased(id, session.user.email);
  if (purchased) {
    return NextResponse.json({ access: true, reason: "purchased" });
  }

  // PRO 이상 플랜 무료 열람 혜택 (월 5편, EXPERT 무제한)
  const plan = await resolveQuotaPlan(session.user.email, session.user.plan);
  const access = checkAccess(plan, "report_paid");
  if (access.allowed) {
    return NextResponse.json({ access: true, reason: "plan", plan });
  }

  return NextResponse.json({
    access: false,
    reason: "requires_purchase",
    price: report.price,
    reportId: id,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "리포트를 찾을 수 없습니다." }, { status: 404 });

  // 이미 구매한 경우
  const alreadyPurchased = await hasPurchased(id, session.user.email);
  if (alreadyPurchased) {
    return NextResponse.json({ ok: true, alreadyPurchased: true });
  }

  const body = (await req.json().catch(() => ({}))) as {
    paymentId?: string;
    orderId?: string;
    usePlanBenefit?: boolean;
  };

  // 플랜 혜택으로 무료 접근 (PRO/EXPERT)
  if (body.usePlanBenefit) {
    const plan = await resolveQuotaPlan(session.user.email, session.user.plan);
    const access = checkAccess(plan, "report_paid");
    if (!access.allowed) {
      return NextResponse.json(
        { error: "이 기능은 PRO 이상 플랜에서 이용 가능합니다." },
        { status: 403 },
      );
    }
    // 구매 기록 저장 (amount = 0, 플랜 혜택 표시)
    try {
      const purchase = await createPurchase({
        reportId: id,
        userEmail: session.user.email,
        amount: 0,
        paymentId: `plan-benefit-${plan}`,
      });
      return NextResponse.json({ ok: true, purchase, reason: "plan_benefit" });
    } catch {
      // Supabase 미설정 환경에서는 OK 처리
      return NextResponse.json({ ok: true, reason: "plan_benefit_no_db" });
    }
  }

  // 결제 후 구매 등록
  const paymentId = String(body.paymentId ?? "").trim();
  const orderId = String(body.orderId ?? "").trim();
  if (!paymentId || !orderId) {
    return NextResponse.json(
      { error: "paymentId와 orderId가 필요합니다." },
      { status: 400 },
    );
  }

  const paidByKey = await getPaidPaymentByProviderKey(paymentId);
  const paidByOrder = await getPaymentByOrderId(orderId);
  if (!paidByKey || !paidByOrder || paidByOrder.status !== "paid") {
    return NextResponse.json(
      { error: "결제 검증에 실패했습니다. 다시 시도해 주세요." },
      { status: 400 },
    );
  }
  if (paidByOrder.providerPaymentKey !== paymentId || paidByOrder.id !== paidByKey.id) {
    return NextResponse.json({ error: "결제 정보가 일치하지 않습니다." }, { status: 400 });
  }
  if (
    paidByOrder.userEmail &&
    paidByOrder.userEmail.toLowerCase() !== session.user.email.toLowerCase()
  ) {
    return NextResponse.json({ error: "본인 결제 내역만 사용할 수 있습니다." }, { status: 403 });
  }
  if (Number(paidByOrder.amount) < Number(report.price)) {
    return NextResponse.json({ error: "결제 금액이 부족합니다." }, { status: 400 });
  }

  try {
    const purchase = await createPurchase({
      reportId: id,
      userEmail: session.user.email,
      amount: report.price,
      paymentId: `${orderId}:${paymentId}`,
    });
    return NextResponse.json({ ok: true, purchase }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "구매 처리 실패" },
      { status: 500 },
    );
  }
}
