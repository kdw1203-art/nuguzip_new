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
import { logger } from "@/lib/log";
import {
  applyRateLimit,
  WRITE_RATE_LIMIT,
  rateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";
import { dbUnavailable } from "@/lib/api/db-unavailable";

/** 구매 여부를 못 읽은 것을 "안 샀다"로 읽지 않기 위한 안내. */
const PURCHASE_UNAVAILABLE = "지금은 구매 내역을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.";

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
  /* 이메일은 여기서 한 번 정규화한다(소문자). 예전엔 raw 세션 이메일로 구매를
     저장했는데, 열람 게이트(노트·상세)는 소문자로 조회한다 — 대소문자가 섞인
     계정은 **구매하고도 못 여는** 불일치가 생긴다. 저장·중복확인·게이트 전부
     같은 값이어야 한다. */
  const email = session?.user?.email?.trim().toLowerCase();
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

  /* 이미 구매했는지 확인.
     못 읽었으면 "안 샀다"로 넘어가지 않는다 — 그대로 진행하면 이미 결제한
     사람에게 포인트를 한 번 더 받게 된다. (바로 아래 잔액 확인과 같은 태도다.) */
  let alreadyPurchased: boolean;
  try {
    alreadyPurchased = await hasPurchased(id, email);
  } catch (err) {
    return dbUnavailable(`구매 기록 조회 실패 (report=${id})`, err, PURCHASE_UNAVAILABLE);
  }
  if (alreadyPurchased) {
    return NextResponse.json({ ok: true, access: true, alreadyPurchased: true });
  }

  // 잔액 확인 (친절한 사전 안내)
  /* 못 읽은 잔액을 0 으로 보면 "포인트가 부족합니다 (보유 0P)" 가 되는데,
     실제로는 충분히 가진 사람일 수 있다. 부족 안내(402)와 확인 실패(503)를 나눈다. */
  const read = await getBalance(email).then(
    (b) => ({ ok: true as const, balance: b }),
    (err: unknown) => {
      logger.error("[creator/reports/buy] 잔액 조회 실패", err);
      return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
    },
  );
  if (!read.ok) {
    return NextResponse.json(
      { error: `보유 포인트를 확인하지 못했어요. 잠시 후 다시 시도해 주세요. (${read.cause})` },
      { status: 503 },
    );
  }
  const balance = read.balance;
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
      /* payment_id 는 uuid 가 아니라 text 다(20260727090500) — 예전엔 uuid 컬럼에
         이 문자열을 넣어 insert 가 22P02 로 항상 실패했고, 바로 위에서 포인트를
         이미 차감한 뒤라 사용자는 포인트만 잃었다. 유니크 인덱스가 붙었으므로
         구매자까지 넣어 사람마다 다른 값이 되게 한다. */
      paymentId: `points:${id}:${email.toLowerCase()}`,
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
