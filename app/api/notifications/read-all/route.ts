import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { markAllInboxRead } from "@/lib/notifications/inbox";

export async function POST() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  await markAllInboxRead(session.user.email);
  return NextResponse.json({ ok: true });
}
