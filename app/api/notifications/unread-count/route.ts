/**
 * 미읽음 알림 수 — B10 헤더 벨 배지용 경량 엔드포인트.
 * GET /api/notifications/unread-count → { count } (비로그인 → 0)
 *
 * 집계에 실패하면 `count: null` 이다. 0 이 아니다 — 0 은 "안 읽은 알림이 없다" 는
 * 사실 주장이고, null 은 "확인하지 못했다" 는 뜻이다. 소비자(NotificationBell)는
 * 숫자가 아닌 값을 받으면 배지를 그리지 않으므로 없는 배지가 거짓말이 되지 않는다.
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { countUnreadInbox } from "@/lib/notifications/inbox";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ count: 0 });
  const counted = await countUnreadInbox(email).then(
    (count) => ({ ok: true as const, count }),
    (err: unknown) => {
      logger.error("[api/notifications/unread-count] 미읽음 집계 실패", err);
      return { ok: false as const };
    },
  );
  if (!counted.ok) return NextResponse.json({ count: null }, { status: 503 });
  return NextResponse.json({ count: counted.count });
}
