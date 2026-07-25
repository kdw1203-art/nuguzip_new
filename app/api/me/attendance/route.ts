import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { checkIn, getAttendanceHistory, kstDateString } from "@/lib/points/store-db";
import { awardPoints, getBalance, getHistory } from "@/lib/points/ledger";
import { applyRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET() {
  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  // B2: 잔액·내역은 원장(point_ledger) 단일 소스로 통일 (구 user_points 이중집계 제거)
  const [totalPoints, attendance, ledgerHistory] = await Promise.all([
    getBalance(session.user.email),
    getAttendanceHistory(session.user.email, 7),
    getHistory(session.user.email, 10),
  ]);
  const pointsHistory = ledgerHistory.map((r, i) => ({
    id: `${r.createdAt}-${i}`,
    delta: r.delta,
    reason: r.reason,
    createdAt: r.createdAt,
  }));
  // "오늘"은 출석 기록과 같은 KST 기준 (UTC 로 보면 KST 0~9시에 어긋난다)
  const today = kstDateString();
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

  // 이미 출석한 날은 재지급하지 않는다 (조회만).
  if (result.alreadyChecked) {
    const balance = await getBalance(session.user.email);
    return NextResponse.json({ ok: true, awarded: 0, balance, ...result }, { status: 200 });
  }

  // 출석 기본 10P — refId 로 KST 날짜를 넘겨 하루 1회 멱등을 원장에서도 보장
  // (catalog dailyCap=1 은 서버 UTC 날짜 기준이라 KST 경계에서 어긋날 수 있다).
  const base = await awardPoints(session.user.email, "attendance", result.date);

  // 연속 출석 보너스 실지급 — checkIn 이 계산만 하고 버리던 스트릭 티어를
  // 원장 규칙으로 집행한다: 7일 이상 +40P(합 50P), 3일 이상 +10P(합 20P). 멱등(refId=날짜).
  let bonusAwarded = 0;
  let balance = base.balance;
  const bonusRule =
    result.streak >= 7 ? "attendance_streak_7" : result.streak >= 3 ? "attendance_streak_3" : null;
  if (bonusRule) {
    const bonus = await awardPoints(session.user.email, bonusRule, result.date);
    bonusAwarded = bonus.awarded;
    if (bonus.ok) balance = bonus.balance;
  }

  return NextResponse.json(
    {
      ok: true,
      awarded: base.awarded + bonusAwarded,
      baseAwarded: base.awarded,
      bonusAwarded,
      balance,
      ...result,
    },
    { status: 201 },
  );
}
