/**
 * POST /api/push/subscribe   — 푸시 구독 저장
 * DELETE /api/push/subscribe — 구독 삭제 (알림 끄기)
 * GET /api/push/subscribe    — VAPID 공개키 반환
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getVapidPublicKey } from "@/lib/push/vapid";

export const runtime = "nodejs";

export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json({
      enabled: false,
      publicKey: null,
      reason: "VAPID 키 미설정",
    });
  }
  return NextResponse.json({
    enabled: true,
    publicKey,
    policy: {
      requiresLogin: true,
      eventTypes: ["comment", "meeting", "attendance", "service"],
    },
  });
}

export async function POST(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "푸시 알림은 로그인 후 사용할 수 있습니다.", requiresLogin: true },
      { status: 401 },
    );
  }
  const sb = getServiceSupabase();

  const body = (await req.json().catch(() => ({}))) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "endpoint, keys.p256dh, keys.auth 필수" }, { status: 400 });
  }

  if (!sb) {
    return NextResponse.json({ ok: true, stored: false, note: "Supabase 미설정 - 메모리만" });
  }

  const ua = req.headers.get("user-agent") ?? null;

  const { error } = await sb.from("push_subscriptions").upsert(
    {
      user_email: session.user.email,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: ua,
      requires_login: true,
      event_types: ["comment", "meeting", "attendance", "service"],
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, stored: true });
}

export async function DELETE(req: Request) {
  const sb = getServiceSupabase();
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };

  if (!body.endpoint) {
    return NextResponse.json({ error: "endpoint 필수" }, { status: 400 });
  }

  if (!sb) return NextResponse.json({ ok: true });

  await sb.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
  return NextResponse.json({ ok: true });
}
