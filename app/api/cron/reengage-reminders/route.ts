import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { sendPush, type PushPayload } from "@/lib/push/vapid";
import {
  loadReengagementCandidates,
  COOLDOWN_DAYS,
  IDLE_DAYS,
  type ReengagementCandidate,
} from "@/lib/reengagement/candidates";
import { captureException } from "@/lib/monitoring/capture";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * B9 — 이탈 리마인드 크론.
 *
 * 선별 기준과 문구의 근거는 lib/reengagement/candidates.ts 에 있다. 여기서는
 * 보내고 기록하는 일만 한다.
 *
 * 채널: 인앱 수신함(항상) + 웹푸시(구독이 있을 때만). **이메일은 보내지 않는다.**
 * 발송 후 reengagement_log 에 남기고, 그 로그가 다음 회차의 쿨다운 근거가 된다.
 * 로그 기록이 실패하면 그 사람은 다음 회차에 또 받게 되므로, 기록 실패는
 * 요약에 logFailed 로 그대로 드러낸다(조용히 넘기지 않는다).
 *
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 *       price-alerts·saved-search-alerts 와 동일.
 * fail-soft: hard-throw 하지 않고 JSON 요약을 반환한다.
 *
 * dryRun: ?dry=1 이면 후보만 세고 아무것도 보내지 않는다. 처음 켤 때 명단을
 *         눈으로 확인하고 켜라고 둔 스위치다.
 *
 * 주기: `.github/workflows/etl.yml` 의 `alerts` 잡이 주 1회(화 09:00 UTC = 18:00 KST)
 *       호출한다. 매일 돌릴 이유가 없다 — 사람당 쿨다운이 30일이라 매일 돌려도
 *       대상은 거의 그대로이고, 발송 시각만 평일 저녁에 몰아 두는 편이 알림으로서
 *       덜 성가시다. (예전에는 vercel.json 의 crons 에만 적혀 있었는데 이 플랜에서
 *       Vercel 크론이 실행되지 않아 실제로는 한 번도 돌지 않았다.)
 */

const BATCH = 200;

interface RunSummary {
  ok: boolean;
  dryRun: boolean;
  /** 휴면 구간(IDLE_DAYS ~ MAX_DORMANT_DAYS)에 들어온 사람 수 */
  dormant: number;
  /** 알림을 끈 사람 / 쿨다운 중인 사람 / 알릴 근거가 없는 사람 */
  optedOut: number;
  cooldown: number;
  noEvidence: number;
  /** 실제로 보낸 수 */
  notified: number;
  /** 그중 웹푸시가 나간 구독 수 */
  pushSent: number;
  /** 발송은 됐는데 로그 기록에 실패한 수 — 다음 회차 중복 발송 위험 */
  logFailed: number;
  reason?: string;
}

/** 웹푸시는 있으면 보내고 없으면 조용히 넘어간다. 실패해도 인앱 알림은 이미 남았다. */
async function pushIfSubscribed(
  sb: ReturnType<typeof getServiceSupabase>,
  c: ReengagementCandidate,
): Promise<number> {
  if (!sb) return 0;
  try {
    const { data, error } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_email", c.userEmail)
      .limit(20);
    /* 못 읽은 것과 "구독 없음"은 다른 사실이다. 발송은 best-effort 라 계속하되
       못 읽었다는 것만은 로그에 남긴다(안 그러면 0건으로만 보인다). */
    if (error) {
      logger.warn(`[cron/reengage] push_subscriptions 조회 실패 (${c.userEmail})`, error);
      return 0;
    }
    const subs = (data ?? []) as Array<Record<string, unknown>>;
    if (subs.length === 0) return 0;

    const payload: PushPayload = {
      title: c.title,
      body: c.body,
      url: c.actionUrl,
      tag: `reengage-${c.reason}`,
      eventType: "generic",
    };
    let sent = 0;
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          const r = await sendPush(
            {
              endpoint: String(s.endpoint),
              keys: { p256dh: String(s.p256dh), auth: String(s.auth) },
            },
            payload,
          );
          if (r.ok) sent += 1;
        } catch {
          // 개별 구독 실패는 무시 — 인앱 알림이 이미 남아 있다
        }
      }),
    );
    return sent;
  } catch (e) {
    captureException(e, { where: "cron/reengage-reminders:push", email: c.userEmail });
    return 0;
  }
}

async function runReengagement(dryRun: boolean): Promise<RunSummary> {
  const scan = await loadReengagementCandidates(BATCH);
  const base: RunSummary = {
    ok: true,
    dryRun,
    dormant: scan.dormant,
    optedOut: scan.optedOut,
    cooldown: scan.cooldown,
    noEvidence: scan.noEvidence,
    notified: 0,
    pushSent: 0,
    logFailed: 0,
    ...(scan.reason ? { reason: scan.reason } : {}),
  };

  if (dryRun || scan.candidates.length === 0) return base;

  const sb = getServiceSupabase();
  let notified = 0;
  let pushSent = 0;
  let logFailed = 0;

  for (const c of scan.candidates) {
    try {
      await appendInboxNotification({
        userEmail: c.userEmail,
        title: c.title,
        body: c.body,
        actionUrl: c.actionUrl,
      });
      notified += 1;
      pushSent += await pushIfSubscribed(sb, c);

      /* 쿨다운의 근거. 여기 실패하면 다음 회차에 같은 사람이 또 뽑히므로 숨기지 않는다. */
      if (sb) {
        const { error } = await sb.from("reengagement_log").insert({
          user_email: c.userEmail,
          reason: c.reason,
          channels: ["inbox"],
          payload: {
            title: c.title,
            body: c.body,
            actionUrl: c.actionUrl,
            evidenceCount: c.evidenceCount,
            idleDays: c.idleDays,
          },
        });
        if (error) {
          logFailed += 1;
          logger.warn("[cron/reengage-reminders] 로그 기록 실패", error.message);
        }
      } else {
        logFailed += 1;
      }
    } catch (e) {
      captureException(e, {
        where: "cron/reengage-reminders",
        email: c.userEmail,
        reason: c.reason,
      });
    }
  }

  return { ...base, notified, pushSent, logFailed };
}

async function handle(req: Request): Promise<Response> {
  if (!(await authorizeCron(req))) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const summary = await runReengagement(dryRun);
    return NextResponse.json({ ...summary, idleDays: IDLE_DAYS, cooldownDays: COOLDOWN_DAYS });
  } catch (e) {
    captureException(e, { where: "cron/reengage-reminders:handle" });
    logger.error("[cron/reengage-reminders] 실패", e);
    return NextResponse.json({ ok: false, dryRun, dormant: 0, notified: 0 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
