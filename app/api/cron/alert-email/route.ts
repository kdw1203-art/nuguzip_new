import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sendEmail, isEmailConfigured } from "@/lib/email/send";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * [G002] 심각 경보 이메일 — 경보를 대시보드 밖으로 내보내는 유일한 통로.
 *
 * 실측 배경: billing-renewals 크론이 4일 21시간 동안 critical 이었는데
 * 아무도 몰랐다. 경보는 ops.health_alert_log 에 쌓이고 있었고(감시 크론들은
 * 전부 정상 작동), 그걸 보려면 관리자 콘솔에 "들어와야" 했다.
 *
 * 동작:
 *  - 최근 24시간 critical 경보를 모은다. 없으면 아무것도 하지 않는다.
 *  - 마지막 발송이 23시간 안이면 건너뛴다(같은 장애로 매시간 울리지 않기).
 *  - RESEND_API_KEY 와 ALERT_EMAIL_TO 가 있어야 나간다. 없으면 그 사실을
 *    응답에 정직하게 적는다 — "보냈다"고 착각하게 두지 않는다.
 *
 * 스케줄: vercel.json crons — 매시 5분.
 */
async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ ok: false, reason: "no-db" }, { status: 500 });
  }

  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: alerts, error } = await sb
    .schema("ops")
    .from("health_alert_log")
    .select("check_name, severity, detail, checked_at")
    .eq("severity", "critical")
    .gte("checked_at", since)
    .order("checked_at", { ascending: false })
    .limit(200);
  if (error) {
    logger.error("[alert-email] 경보 조회 실패", error);
    return NextResponse.json({ ok: false, reason: "query-failed" }, { status: 500 });
  }
  const rows = alerts ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, criticals: 0, sent: false, reason: "무경보" });
  }

  // 쿨다운 — 마지막 발송이 23시간 안이면 다시 보내지 않는다
  const { data: last } = await sb
    .schema("ops")
    .from("alert_email_log")
    .select("sent_at")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastSent = last?.sent_at ? new Date(String(last.sent_at)).getTime() : 0;
  if (Date.now() - lastSent < 23 * 3_600_000) {
    return NextResponse.json({ ok: true, criticals: rows.length, sent: false, reason: "쿨다운" });
  }

  const to = process.env.ALERT_EMAIL_TO?.trim();
  if (!to || !isEmailConfigured()) {
    /* 발송 조건 미충족 — 로그에 남겨 관리자 화면·크론 응답에서 보이게 한다.
       (RESEND_API_KEY · ALERT_EMAIL_TO 는 소유자가 Vercel 에 등록해야 한다) */
    return NextResponse.json({
      ok: true,
      criticals: rows.length,
      sent: false,
      reason: !to ? "ALERT_EMAIL_TO 미설정" : "RESEND_API_KEY 미설정",
    });
  }

  // check_name 별로 접어 요약
  const folded = new Map<string, { n: number; detail: string | null }>();
  for (const r of rows) {
    const k = String(r.check_name ?? "");
    const prev = folded.get(k);
    if (prev) prev.n += 1;
    else folded.set(k, { n: 1, detail: r.detail == null ? null : String(r.detail) });
  }
  const lines = [...folded.entries()].map(
    ([name, v]) => `• ${name} — ${v.n}회${v.detail ? `\n  ${v.detail}` : ""}`,
  );
  const summary = [...folded.keys()].join(", ");

  const result = await sendEmail({
    to,
    subject: `[누구집 경보] 심각 ${folded.size}종 · ${rows.length}건 (24시간)`,
    text: `최근 24시간 critical 경보입니다.\n\n${lines.join("\n")}\n\n운영 콘솔: https://nuguzip.com/admin/ops`,
    html: `<p>최근 24시간 <b>critical</b> 경보입니다.</p><pre style="font-family:inherit;white-space:pre-wrap">${lines
      .map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;"))
      .join("\n")}</pre><p><a href="https://nuguzip.com/admin/ops">운영 콘솔에서 확인</a></p>`,
  });

  if (result.sent) {
    await sb
      .schema("ops")
      .from("alert_email_log")
      .insert({ alert_count: rows.length, summary: summary.slice(0, 500) });
  }
  return NextResponse.json({ ok: true, criticals: rows.length, sent: result.sent, ...(result.sent ? {} : { reason: (result as { reason?: string }).reason }) });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
