/**
 * POST /api/push/send — 관리자가 특정 유저 또는 전체에 푸시 발송
 *
 * body: {
 *   targetEmail?: string,   // 특정 유저 (없으면 전체)
 *   title: string,
 *   body: string,
 *   url?: string,
 *   tag?: string,
 *   eventType?: string,
 * }
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sendPush, initWebPush, type PushPayload } from "@/lib/push/vapid";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!session?.user?.email || role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  initWebPush();

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase 미설정" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    targetEmail?: string;
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
    eventType?: PushPayload["eventType"];
  };

  if (!body.title || !body.body) {
    return NextResponse.json({ error: "title, body 필수" }, { status: 400 });
  }

  const eventType = body.eventType ?? "generic";
  const fallbackUrl =
    eventType === "comment"
      ? "/notifications?filter=comments"
      : eventType === "meeting"
        ? "/market?source=push&campaign=meeting"
        : eventType === "expert"
          ? "/experts?source=push"
          : eventType === "attendance"
            ? "/attendance?source=push&campaign=attendance_reminder"
            : eventType === "payment"
              ? "/payment/history?source=push"
              : "/notifications";

  const payload: PushPayload = {
    title: body.title,
    body: body.body,
    url: body.url ?? fallbackUrl,
    tag: body.tag ?? `woodong-${eventType}`,
    eventType,
  };

  // 구독 조회
  let query = sb.from("push_subscriptions").select("endpoint, p256dh, auth").not("user_email", "is", null);
  if (body.targetEmail) {
    query = query.eq("user_email", body.targetEmail);
  }
  const { data: subs, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, note: "구독 없음" });
  }

  let sent = 0;
  let expired = 0;
  const expiredEndpoints: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        const result = await sendPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        if (result.ok) sent++;
        if (result.expired) {
          expired++;
          expiredEndpoints.push(sub.endpoint);
        }
      } catch {
        // 개별 실패 무시
      }
    }),
  );

  // 만료된 구독 정리
  if (expiredEndpoints.length > 0) {
    await sb.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
  }

  return NextResponse.json({ ok: true, sent, expired });
}
