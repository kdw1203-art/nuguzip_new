import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { markInboxItemRead } from "@/lib/notifications/inbox";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  const ok = await markInboxItemRead(session.user.email, id);
  if (!ok) {
    return NextResponse.json({ error: "알림을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
