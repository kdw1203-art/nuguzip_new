import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sendPush, type PushPayload } from "@/lib/push/vapid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 출석 리마인드 — 오늘 아직 출석하지 않은 웹푸시 구독자에게 1회 발송.
 *
 * 보호: CRON_SECRET(?secret= / x-cron-secret) · x-vercel-cron · 관리자 세션.
 * 다른 크론과 같은 규칙으로 맞춘 것은 어드민 "수집 작업 실행" 패널에서
 * 이 라우트만 403 이 나던 문제 때문이다(관리자 세션 인가가 빠져 있었다).
 *
 * ⚠️ 알려진 한계(고치지 않고 남겨 둠): `today` 는 UTC 날짜다. 적립 쪽
 *    (lib/points/store-db.ts checkIn)도 같은 UTC 기준이라 이 크론의 "오늘 출석했나"
 *    판정 자체는 어긋나지 않는다. 다만 한국 사용자에게는 하루가 09:00 KST 에
 *    바뀌는 셈이라 연속 출석 스트릭이 그 시각 경계에서 끊길 수 있다. 기준을
 *    KST 로 옮기려면 이미 쌓인 user_attendance 행의 의미까지 함께 옮겨야 해서
 *    이 변경과 분리했다.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorized =
    fromVercelCron ||
    (expected ? provided === expected : true) ||
    (await isAdminApiRequest());
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ ok: true, sent: 0, note: "Supabase 미설정" });

  const today = new Date().toISOString().slice(0, 10);
  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("user_email, endpoint, p256dh, auth")
    .not("user_email", "is", null)
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const emails = [...new Set((subs ?? []).map((s) => String(s.user_email)).filter(Boolean))];
  const { data: checked } = await sb
    .from("user_attendance")
    .select("user_email")
    .eq("date", today)
    .in("user_email", emails.length ? emails : ["__none__"]);
  const checkedSet = new Set((checked ?? []).map((r) => String(r.user_email).toLowerCase()));

  const payload: PushPayload = {
    title: "오늘 출석 체크를 잊지 마세요",
    body: "연속 출석 포인트를 받고 투자 루틴을 이어가세요.",
    // 출석 체크 버튼은 /my/points 안에 있다(app/my/points/AttendanceButton.tsx).
    // 예전에는 `/attendance` 로 보냈는데 그런 라우트가 없어서 알림을 누르면
    // not-found 로 떨어졌다.
    url: "/my/points",
    tag: `attendance-${today}`,
    eventType: "attendance",
  };

  let sent = 0;
  const targets = (subs ?? []).filter(
    (s) => !checkedSet.has(String(s.user_email).toLowerCase()),
  );
  await Promise.allSettled(
    targets.map(async (sub) => {
      const result = await sendPush(
        { endpoint: String(sub.endpoint), keys: { p256dh: String(sub.p256dh), auth: String(sub.auth) } },
        payload,
      );
      if (result.ok) sent += 1;
    }),
  );
  return NextResponse.json({ ok: true, sent, candidates: targets.length });
}

