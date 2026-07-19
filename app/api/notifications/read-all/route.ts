import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { markAllInboxRead } from "@/lib/notifications/inbox";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  await markAllInboxRead(session.user.email);
  return NextResponse.json({ ok: true });
}
