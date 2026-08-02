import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { trySendViaResend } from "@/lib/notifications/resend-send";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * notification_outbox 드레인 (항목 40).
 *
 * 이메일 발송이 실패하거나 키가 없을 때 comment-notify 등이 이 큐에
 * `status:"pending"` 으로 쌓아 왔는데 — **그걸 읽는 워커가 지금까지 없었다.**
 * 큐는 재시도 장치가 아니라 무덤이었다. 이 크론이 하루 1회(etl.yml alerts 잡)
 * 큐를 비운다.
 *
 * 정직성 규칙:
 * - RESEND 키가 없으면 아무것도 "failed" 로 바꾸지 않는다 — 보내려고 시도한
 *   적이 없는 것을 실패로 기록하면 그것도 거짓 기록이다. skipped 로 답한다.
 * - 발송 실패는 attempts 를 올리고 오류 원문을 남긴다. 5회 넘게 실패한 건은
 *   dead 로 옮겨 매일 같은 주소로 재시도하는 스팸을 막는다.
 *
 * 보호: CRON_SECRET(?secret= / x-cron-secret) · x-vercel-cron · 관리자 세션
 * (plan-expiry-sweep 과 같은 규칙).
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

  const resendReady = Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim(),
  );
  if (!resendReady) {
    /* 시도하지 않은 것을 실패로 기록하지 않는다 — 큐는 그대로 두고 사실을 남긴다. */
    return NextResponse.json({
      ok: true,
      sent: 0,
      skipped: "resend-not-configured",
      note: "RESEND_API_KEY / RESEND_FROM_EMAIL 미설정 — 큐를 건드리지 않았습니다.",
    });
  }

  try {
    const { data: pending, error } = await sb
      .from("notification_outbox")
      .select("id, to_email, subject, body, attempts")
      .eq("channel", "email")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);

    let sent = 0;
    let failed = 0;
    let dead = 0;
    for (const row of pending ?? []) {
      const id = String(row.id);
      const to = String(row.to_email ?? "").trim();
      const attempts = Number(row.attempts ?? 0);
      if (!to) {
        await sb.from("notification_outbox").update({ status: "dead" }).eq("id", id);
        dead += 1;
        continue;
      }
      const result = await trySendViaResend({
        to,
        subject: String(row.subject ?? "[누구집] 알림"),
        html: `<div style="font-family:sans-serif;line-height:1.7;white-space:pre-wrap">${String(
          row.body ?? "",
        )}</div>`,
        text: String(row.body ?? ""),
      });
      if (result.ok) {
        await sb
          .from("notification_outbox")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", id);
        sent += 1;
      } else if (attempts + 1 >= 5) {
        await sb
          .from("notification_outbox")
          .update({ status: "dead", attempts: attempts + 1, last_error: result.error ?? null })
          .eq("id", id);
        dead += 1;
      } else {
        await sb
          .from("notification_outbox")
          .update({ attempts: attempts + 1, last_error: result.error ?? null })
          .eq("id", id);
        failed += 1;
      }
    }

    await logIngest({
      source: "notification-outbox",
      dataset: "notification_outbox",
      origin: "cron-fetch",
      rows: sent,
      status: "ok",
      message: `outbox 드레인 — 발송 ${sent} · 재시도 대기 ${failed} · dead ${dead}`,
    });
    return NextResponse.json({ ok: true, sent, failed, dead, pending: pending?.length ?? 0 });
  } catch (e) {
    logger.error("[outbox-drain]", e);
    return NextResponse.json(
      { ok: false, error: ingestErrorMessage(e) },
      { status: 500 },
    );
  }
}
