/**
 * POST /api/creator/reports/[id]/buy — 포인트로 유료 리포트 구매 (구매자 측)
 *
 * 흐름:
 *  1) 인증 · 구매 속도 제한 (IP + 사용자별)
 *  2) 리포트 조회 → 무료/본인/중복구매 처리
 *  3) spendPoints(구매자, 가격, `report:${id}`) 로 포인트 차감
 *  4) report_purchases 에 판매 기록 (amount=가격 포인트) → 크리에이터 정산 예정으로 집계
 *     · 크리에이터에게 포인트를 적립하지 않는다(그건 정산이며, report_purchases 기록으로 대체).
 *  5) 접근 권한 부여 = 구매 기록 존재 (hasPurchased)
 */
import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getReport } from "@/lib/reports/store-db";
import { hasPurchased, createPurchase } from "@/lib/report-purchases/store-db";
import { getBalance, spendPoints } from "@/lib/points/ledger";
import {
  applyRateLimit,
  WRITE_RATE_LIMIT,
  rateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // IP 기반 속도 제한
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 사용자별 구매 속도 제한 (1분 10회) — 이중 결제·오남용 완화
  const rl = rateLimit(`report-buy:${email.toLowerCase()}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const { id } = await params;
  const report = await getReport(id);
  if (!report) {
    return NextResponse.json({ error: "리포트를 찾을 수 없습니다." }, { status: 404 });
  }

  const price = Number(report.price) || 0;

  // 무료 리포트 → 누구나 접근
  if (!report.isPremium || price <= 0) {
    return NextResponse.json({ ok: true, access: true, reason: "free" });
  }

  // 본인 리포트 → 구매 불필요
  if (report.authorId && report.authorId.toLowerCase() === email.toLowerCase()) {
    return NextResponse.json({ ok: true, access: true, reason: "owner" });
  }

  // 이미 구매
  if (await hasPurchased(id, email)) {
    return NextResponse.json({ ok: true, access: true, alreadyPurchased: true });
  }

  // 잔액 확인 (친절한 사전 안내)
  const balance = await getBalance(email);
  if (balance < price) {
    return NextResponse.json(
      {
        error: `포인트가 부족합니다. (보유 ${balance.toLocaleString("ko-KR")}P · 필요 ${price.toLocaleString("ko-KR")}P)`,
        reason: "insufficient",
        balance,
        price,
      },
      { status: 402 },
    );
  }

  // 포인트 차감
  const spent = await spendPoints(email, price, `report:${id}`, id);
  if (!spent.ok) {
    const status = spent.reason === "insufficient" ? 402 : 400;
    return NextResponse.json(
      {
        error:
          spent.reason === "insufficient"
            ? "포인트가 부족합니다."
            : "포인트 결제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        reason: spent.reason,
        balance: spent.balance,
      },
      { status },
    );
  }

  // 판매 기록 (크리에이터 정산 예정으로 집계됨) + 구매자 접근 부여
  try {
    const purchase = await createPurchase({
      reportId: id,
      userEmail: email,
      amount: price,
      paymentId: `points:${id}`,
    });
    return NextResponse.json(
      { ok: true, access: true, purchase, balance: spent.balance },
      { status: 201 },
    );
  } catch (e) {
    // 차감은 됐지만 기록 실패 — 정직하게 안내 (문의 시 관리자 보정)
    return NextResponse.json(
      {
        error: "결제는 처리됐으나 구매 기록에 실패했습니다. 고객센터에 문의해 주세요.",
        detail: e instanceof Error ? e.message : "unknown",
        balance: spent.balance,
      },
      { status: 500 },
    );
  }
}
