/**
 * 미읽음 알림 수 — B10 헤더 벨 배지용 경량 엔드포인트.
 * GET /api/notifications/unread-count → { count } (비로그인 → 0)
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { countUnreadInbox } from "@/lib/notifications/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ count: 0 });
  const count = await countUnreadInbox(email).catch(() => 0);
  return NextResponse.json({ count });
}
