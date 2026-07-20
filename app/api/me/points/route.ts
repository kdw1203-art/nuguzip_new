import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getBalance, getHistory } from "@/lib/points/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/points — 로그인 사용자의 포인트 잔액 + 내역.
 * 비로그인·DB 미설정 시 { balance: 0, history: [] } 로 우아하게 처리.
 */
export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ balance: 0, history: [] });
  }
  const [balance, history] = await Promise.all([
    getBalance(email),
    getHistory(email, 50),
  ]);
  return NextResponse.json({ balance, history });
}
