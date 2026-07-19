import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sendPush, type PushPayload } from "@/lib/push/vapid";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  if (expected && provided !== expected) {
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
    url: "/attendance",
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

