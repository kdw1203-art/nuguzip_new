import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { listInboxForEmail } from "@/lib/notifications/inbox";
import { getHistory } from "@/lib/points/ledger";
import { EARN_RULES, getSpendItem } from "@/lib/points/catalog";

/**
 * 통합 알림 센터 데이터 소스.
 *  - items:  받은편지함 알림(user_inbox_notifications) — 읽음/이동 가능
 *  - points: 포인트 원장(point_ledger)에서 파생한 적립·소비 내역 — 읽기 전용
 * GET 응답의 items 형태는 기존과 동일하며 points 만 추가되어 하위 호환된다.
 */

export type PointNotification = {
  id: string;
  delta: number;
  label: string;
  balance: number;
  createdAt: string;
};

/** 원장 reason(룰/상품 키) → 사람이 읽는 라벨. 매핑 없으면 원문 유지. */
function pointLabel(reason: string): string {
  const earn = EARN_RULES[reason];
  if (earn) return earn.label;
  const spend = getSpendItem(reason);
  if (spend) return spend.label;
  return reason || "포인트 변동";
}

export async function GET() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const email = session.user.email;

  const [items, history] = await Promise.all([
    listInboxForEmail(email),
    getHistory(email, 50),
  ]);

  const points: PointNotification[] = history.map((r, i) => ({
    id: `pt-${new Date(r.createdAt).getTime() || 0}-${i}`,
    delta: r.delta,
    label: pointLabel(r.reason),
    balance: r.balance,
    createdAt: r.createdAt,
  }));

  return NextResponse.json({ items, points });
}
