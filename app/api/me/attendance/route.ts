import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { checkIn, getPoints, getAttendanceHistory, getPointsHistory } from "@/lib/points/store-db";
import { awardPoints } from "@/lib/points/ledger";
import { applyRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET() {
  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const [totalPoints, attendance, pointsHistory] = await Promise.all([
    getPoints(session.user.email),
    getAttendanceHistory(session.user.email, 7),
    getPointsHistory(session.user.email, 10),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const checkedToday = attendance.some((a) => a.date === today);
  const streak = attendance[0]?.streak ?? 0;
  return NextResponse.json({ totalPoints, checkedToday, streak, attendance, pointsHistory });
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, { max: 5, windowMs: 60_000 });
  if (limited) return limited;
  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const result = await checkIn(session.user.email);
  // 출석 포인트 적립 — catalog dailyCap=1 이 하루 1회를 보장.
  const award = await awardPoints(session.user.email, "attendance");
  return NextResponse.json(
    { ok: true, awarded: award.awarded, balance: award.balance, ...result },
    { status: result.alreadyChecked ? 200 : 201 },
  );
}
