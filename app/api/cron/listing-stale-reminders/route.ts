import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { sendPush, type PushPayload } from "@/lib/push/vapid";
import {
  loadStaleListingOwners,
  STALE_SCAN_LIMIT,
  type StaleOwnerGroup,
} from "@/lib/listings/staleness";
import {
  LISTING_STALE_DAYS,
  LISTING_CLOSE_SUGGEST_DAYS,
} from "@/lib/listings/store-db";
import { captureException } from "@/lib/monitoring/capture";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * I10 — 매물 신선도 알림 크론(끌어올리기 안내 21일 · 마감 제안 60일).
 *
 * 선별 기준과 문구의 근거는 lib/listings/staleness.ts 에 있다. 여기서는 보내고
 * 단계를 기록하는 일만 한다.
 *
 * 채널: 인앱 수신함(항상) + 웹푸시(구독이 있을 때만). **이메일은 보내지 않는다.**
 *
 * 기록 순서가 중요하다 — 알림이 **성공한 소유자의 매물만** stale_notice_stage 를
 * 올린다. 먼저 올려 두고 보내다 실패하면 그 매물은 영영 안내를 못 받는다. 반대로
 * 하면 최악이 "다음 회차에 한 번 더 시도"라서, 실패의 방향을 그쪽으로 잡았다.
 *
 * **자동 마감은 하지 않는다.** 2단계도 status 를 건드리지 않고 제안만 한다.
 * 갱신이 없다는 사실이 거래가 끝났다는 뜻은 아니다.
 *
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 *       reengage-reminders 와 동일.
 * fail-soft: hard-throw 하지 않고 JSON 요약을 반환한다.
 * dryRun: ?dry=1 이면 명단만 세고 아무것도 보내지 않으며 단계도 올리지 않는다.
 *
 * 주기: `.github/workflows/etl.yml` 의 `alerts` 잡이 하루 한 번(09:00 UTC = 18:00 KST)
 *       호출한다. 매일 돌아도 매물당 단계가 올라갈 때만 나가므로 최대 2번이다.
 *       (Vercel 크론은 이 플랜에서 실행되지 않는다. 스케줄러는 etl.yml 하나뿐이다.)
 */

interface RunSummary {
  ok: boolean;
  dryRun: boolean;
  /** 신선도 기준을 넘긴 매물 수 */
  stale: number;
  /** 그중 단계가 올라가 알릴 거리가 있던 매물 수 */
  escalated: number;
  /** 같은 단계로 이미 알려서 건너뛴 매물 수 */
  alreadyNotified: number;
  /** 알림을 끈 소유자 / 그 때문에 빠진 매물 */
  optedOutOwners: number;
  optedOutListings: number;
  /** 실제로 알림을 받은 소유자 수 */
  notifiedOwners: number;
  /** 그 알림이 가리키는 매물 수 */
  notifiedListings: number;
  /** 웹푸시가 나간 구독 수 */
  pushSent: number;
  /** 발송은 됐는데 단계 기록에 실패한 매물 수 — 다음 회차 중복 발송 위험 */
  stageWriteFailed: number;
  reason?: string;
}

/** 웹푸시는 있으면 보내고 없으면 조용히 넘어간다. 실패해도 인앱 알림은 이미 남았다. */
async function pushIfSubscribed(
  sb: ReturnType<typeof getServiceSupabase>,
  g: StaleOwnerGroup,
): Promise<number> {
  if (!sb) return 0;
  try {
    const { data, error } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_email", g.userEmail)
      .limit(20);
    /* 못 읽은 것과 "구독 없음"은 다른 사실이다. 발송은 best-effort 라 계속하되
       못 읽었다는 것만은 로그에 남긴다(안 그러면 0건으로만 보인다). */
    if (error) {
      logger.warn(`[cron/listing-stale] push_subscriptions 조회 실패 (${g.userEmail})`, error);
      return 0;
    }
    const subs = (data ?? []) as Array<Record<string, unknown>>;
    if (subs.length === 0) return 0;

    const payload: PushPayload = {
      title: g.title,
      body: g.body,
      url: g.actionUrl,
      /* 같은 태그로 덮어쓰기 — 안 읽은 신선도 알림이 여러 개 쌓이지 않게 한다. */
      tag: "listing-stale",
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
    captureException(e, {
      where: "cron/listing-stale-reminders:push",
      email: g.userEmail,
    });
    return 0;
  }
}

/** 알림이 나간 매물만 단계를 올린다. 단계별로 묶어서 최대 2번 UPDATE. */
async function markNotified(
  sb: ReturnType<typeof getServiceSupabase>,
  g: StaleOwnerGroup,
): Promise<number> {
  if (!sb) return g.listings.length;
  const now = new Date().toISOString();
  let failed = 0;

  for (const stage of [1, 2] as const) {
    const ids = g.listings.filter((l) => l.stage === stage).map((l) => l.id);
    if (ids.length === 0) continue;
    const { error } = await sb
      .from("listings")
      .update({ stale_notified_at: now, stale_notice_stage: stage })
      .in("id", ids);
    if (error) {
      failed += ids.length;
      logger.warn("[cron/listing-stale-reminders] 단계 기록 실패", error.message);
    }
  }
  return failed;
}

async function runStaleReminders(dryRun: boolean): Promise<RunSummary> {
  const scan = await loadStaleListingOwners(STALE_SCAN_LIMIT);
  const base: RunSummary = {
    ok: true,
    dryRun,
    stale: scan.stale,
    escalated: scan.escalated,
    alreadyNotified: scan.alreadyNotified,
    optedOutOwners: scan.optedOutOwners,
    optedOutListings: scan.optedOutListings,
    notifiedOwners: 0,
    notifiedListings: 0,
    pushSent: 0,
    stageWriteFailed: 0,
    ...(scan.reason ? { reason: scan.reason } : {}),
  };

  if (dryRun || scan.owners.length === 0) return base;

  const sb = getServiceSupabase();
  let notifiedOwners = 0;
  let notifiedListings = 0;
  let pushSent = 0;
  let stageWriteFailed = 0;

  for (const g of scan.owners) {
    try {
      await appendInboxNotification({
        userEmail: g.userEmail,
        title: g.title,
        body: g.body,
        actionUrl: g.actionUrl,
      });
      notifiedOwners += 1;
      notifiedListings += g.listings.length;
      pushSent += await pushIfSubscribed(sb, g);
      /* 여기부터가 "다시 보내지 않기"의 근거. 실패하면 숨기지 않고 요약에 드러낸다. */
      stageWriteFailed += await markNotified(sb, g);
    } catch (e) {
      /* 이 소유자는 단계를 올리지 않았으므로 다음 회차에 다시 뽑힌다. */
      captureException(e, {
        where: "cron/listing-stale-reminders",
        email: g.userEmail,
      });
    }
  }

  return { ...base, notifiedOwners, notifiedListings, pushSent, stageWriteFailed };
}

async function handle(req: Request): Promise<Response> {
  if (!(await authorizeCron(req))) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const summary = await runStaleReminders(dryRun);
    return NextResponse.json({
      ...summary,
      staleDays: LISTING_STALE_DAYS,
      closeSuggestDays: LISTING_CLOSE_SUGGEST_DAYS,
    });
  } catch (e) {
    captureException(e, { where: "cron/listing-stale-reminders:handle" });
    logger.error("[cron/listing-stale-reminders] 실패", e);
    return NextResponse.json({ ok: false, dryRun, stale: 0, notifiedOwners: 0 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
