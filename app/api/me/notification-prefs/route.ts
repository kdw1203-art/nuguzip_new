/**
 * GET   /api/me/notification-prefs  — 알림 설정 조회
 * PATCH /api/me/notification-prefs  — 알림 설정 업데이트
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrefs, upsertPrefs } from "@/lib/notification-prefs/store-db";
import type { NotificationPrefs } from "@/lib/notification-prefs/store-db";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";

/** 못 읽은 설정을 기본값(대부분 켜짐)으로 그리지 않기 위한 안내. */
const PREFS_UNAVAILABLE = "지금은 알림 설정을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  /* 기본값을 대신 그려 주지 않는다 — 화면이 토글을 켜진 채로 보여 주고, 그 상태에서
     저장하면 알림을 껐던 사람의 설정이 켜짐으로 덮인다. 화면은 !res.ok 를 이미
     오류 상태로 처리한다(app/my/settings/page.tsx 의 usePrefs). */
  try {
    const prefs = await getPrefs(session.user.email);
    return NextResponse.json({ prefs });
  } catch (err) {
    return dbUnavailable("알림 설정 조회 실패", err, PREFS_UNAVAILABLE);
  }
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
