import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { isAdmin } from "@/lib/auth/is-admin";
import { logger } from "@/lib/log";
import { listInboxForEmail } from "@/lib/notifications/inbox";
import { getHistory } from "@/lib/points/ledger";
import { EARN_RULES, getSpendItem } from "@/lib/points/catalog";

/**
 * 통합 알림 센터 데이터 소스.
 *  - items:  받은편지함 알림(channel='user') — 읽음/이동 가능
 *  - ops:    내부 점검 경보(channel='ops') — **관리자 세션에만** 실린다
 *  - points: 포인트 원장(point_ledger)에서 파생한 적립·소비 내역 — 읽기 전용
 *
 * 운영 경보를 items 에서 뺀 이유는 lib/notifications/inbox.ts 주석 참고 —
 * 요약하면 사용자 알림함 58행이 전부 [HEALTH] 경보였고 '활동' 으로 오분류됐다.
 * 관리자가 아닌 세션은 ops 키 자체를 받지 않는다(빈 배열도 아니고 없음).
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

  /* 2026-07-26: 예전에는 저장소가 실패를 빈 배열로 삼켜서 이 응답이 항상 200 이었다.
     그래서 화면은 "아직 알림이 없어요" 라고 썼다 — 없는 것과 못 읽은 것은 다르다.
     이제 저장소가 던지고, 여기서 503 으로 갈라 내려보낸다(401 과 구분 가능). */
  const admin = isAdmin(session);
  const loaded = await Promise.all([
    listInboxForEmail(email, "user"),
    getHistory(email, 50),
    /* 관리자가 아니면 조회 자체를 하지 않는다 — 걸러 내는 것과 안 읽는 것은 다르다. */
    admin ? listInboxForEmail(email, "ops") : Promise.resolve([]),
  ]).then(
    ([items, history, ops]) => ({ ok: true as const, items, history, ops }),
    (err: unknown) => {
      logger.error("[api/notifications] 알림 조회 실패", err);
      return {
        ok: false as const,
        cause: err instanceof Error ? err.message : String(err),
      };
    },
  );
  if (!loaded.ok) {
    return NextResponse.json(
      { error: `알림을 불러오지 못했습니다: ${loaded.cause}` },
      { status: 503 },
    );
  }
  const { items, history, ops } = loaded;

  const points: PointNotification[] = history.map((r, i) => ({
    id: `pt-${new Date(r.createdAt).getTime() || 0}-${i}`,
    delta: r.delta,
    label: pointLabel(r.reason),
    balance: r.balance,
    createdAt: r.createdAt,
  }));

  return admin
    ? NextResponse.json({ items, points, ops })
    : NextResponse.json({ items, points });
}
