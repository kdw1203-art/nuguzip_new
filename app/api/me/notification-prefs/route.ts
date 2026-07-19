/**
 * GET   /api/me/notification-prefs  — 알림 설정 조회
 * PATCH /api/me/notification-prefs  — 알림 설정 업데이트
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrefs, upsertPrefs } from "@/lib/notification-prefs/store-db";
import type { NotificationPrefs } from "@/lib/notification-prefs/store-db";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const prefs = await getPrefs(session.user.email);
  return NextResponse.json({ prefs });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<
    Omit<NotificationPrefs, "userEmail" | "updatedAt">
  >;

  try {
    const prefs = await upsertPrefs(session.user.email, body);
    return NextResponse.json({ prefs });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "설정 저장 실패" },
      { status: 500 },
    );
  }
}
