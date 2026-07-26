import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getBalance, getHistory } from "@/lib/points/ledger";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/points — 로그인 사용자의 포인트 잔액 + 내역.
 * 비로그인·DB 미설정 시 { balance: 0, history: [] } 로 우아하게 처리.
 *
 * 조회에 실패하면 503 이다. 200 + 빈 내역으로 돌려주면 소비자가 그것을
 * "적립 내역이 없다" 는 사실로 받아 적는다 — 못 읽은 것과 없는 것은 다르다.
 */
export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ balance: 0, history: [] });
  }
  const loaded = await Promise.all([getBalance(email), getHistory(email, 50)]).then(
    ([balance, history]) => ({ ok: true as const, balance, history }),
    (err: unknown) => {
      logger.error("[api/me/points] 포인트 조회 실패", err);
      return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
    },
  );
  if (!loaded.ok) {
    return NextResponse.json(
      { error: `포인트를 불러오지 못했습니다: ${loaded.cause}` },
      { status: 503 },
    );
  }
  return NextResponse.json({ balance: loaded.balance, history: loaded.history });
}
