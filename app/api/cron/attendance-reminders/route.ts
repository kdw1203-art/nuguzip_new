import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sendPush, type PushPayload } from "@/lib/push/vapid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 출석 리마인드 — 오늘 아직 출석하지 않은 웹푸시 구독자에게 1회 발송.
 *
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
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
  const authorized = await authorizeCron(req);
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

  /* 오늘 이미 출석한 사람 — 이 조회가 실패하면 집합이 비고, 그러면 오늘 출석을
     마친 사람에게도 "출석하세요" 가 간다. 보내지 않고 접는다. */
  const { data: checked, error: checkedError } = await sb
    .from("user_attendance")
    .select("user_email")
    .eq("date", today)
    .in("user_email", emails.length ? emails : ["__none__"]);
  if (checkedError) {
    return NextResponse.json(
      { ok: false, sent: 0, skipped: `출석 기록 조회 실패: ${checkedError.message}` },
      { status: 503, headers: { "Retry-After": "600" } },
    );
  }
  const checkedSet = new Set((checked ?? []).map((r) => String(r.user_email).toLowerCase()));

  // 설정에서 출석 리마인드를 끈 사람 제외 — 예전에는 push_subscriptions 전체에
  // 발송해서 /my/settings 의 어떤 스위치로도 벗어날 수 없었다. 행이 없거나
  // 값이 true 면 발송(기본 켜짐 규칙), 명시적으로 false 인 사람만 제외한다.
  /* 이 조회가 실패하면 제외 집합이 비어 "아무도 끄지 않았다"가 되고, 알림을 끈
     사람 전원에게 그대로 발송된다. 껐는지 모르는 채로 보내는 쪽이 한 번 덜
     보내는 쪽보다 나쁘다 — 아무에게도 보내지 않는다(lib/listings/staleness.ts 와
     같은 태도). 다음 크론(매일 18:00 KST)에 다시 시도된다. */
  const { data: optedOut, error: prefsError } = await sb
    .from("notification_preferences")
    .select("user_email")
    .eq("push_attendance", false)
    .in("user_email", emails.length ? emails : ["__none__"]);
  if (prefsError) {
    return NextResponse.json(
      { ok: false, sent: 0, skipped: `알림 설정 조회 실패: ${prefsError.message}` },
      { status: 503, headers: { "Retry-After": "600" } },
    );
  }
  const optedOutSet = new Set(
    (optedOut ?? []).map((r) => String(r.user_email).toLowerCase()),
  );

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
  const targets = (subs ?? []).filter((s) => {
    const em = String(s.user_email).toLowerCase();
    return !checkedSet.has(em) && !optedOutSet.has(em);
  });
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

