import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { isAdmin } from "@/lib/auth/is-admin";
import { markAllInboxRead } from "@/lib/notifications/inbox";

/** POST /api/notifications/read-all?channel=user|ops
 *  channel 을 주지 않으면 사용자 알림만 읽음 처리한다 — 운영 탭의 "모두 읽음" 이
 *  사용자 알림까지 쓸어 가거나 그 반대가 되지 않도록 채널을 명시한다. */
export async function POST(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const raw = new URL(req.url).searchParams.get("channel");
  if (raw === "ops" && !isAdmin(session)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  await markAllInboxRead(session.user.email, raw === "ops" ? "ops" : "user");
  return NextResponse.json({ ok: true });
}
