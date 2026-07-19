import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listInboxForEmail } from "@/lib/notifications/inbox";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const items = await listInboxForEmail(session.user.email);
  return NextResponse.json({ items });
}
