import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { sendPush, type PushPayload } from "@/lib/push/vapid";
import { getWeeklyDigest } from "@/lib/newui/digest";
import { captureException } from "@/lib/monitoring/capture";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 주간 다이제스트 발송 크론.
 *
 * 왜 만들었나: `/digest` 화면이 "알림 설정에서 주간 다이제스트 알림을 켜면 매주
 * 요약을 보내드려요"라고 안내하고 있었는데, 켤 설정 항목도 보내는 경로도 없었다.
 * 사용자에게 지킬 수 없는 약속이 떠 있는 상태였다. 문구를 지우는 대신 약속을
 * 지키는 쪽으로 채운다.
 *
 * 대상: notification_preferences.push_weekly_digest = true 인 사람만.
 *       기본값이 false 라, 명시적으로 켠 사람에게만 나간다.
 *
 * 내용: `getWeeklyDigest()` 가 만든 **실제 수집분** 요약 한 줄. 뉴스·시세·이웃 글이
 *       모두 0 이면 아무에게도 보내지 않는다 — 보낼 내용이 없는데 "요약이 왔어요"라고
 *       알리는 것은 그 자체로 거짓이다(skipped: "empty" 로 응답에 드러낸다).
 *
 * 채널: 인앱 수신함(항상) + 웹푸시(구독이 있을 때만) — reengage-reminders 와 동일.
 *       이메일은 보내지 않는다(발신 도메인·템플릿 미구성).
 *
 * 주기: `.github/workflows/etl.yml` 의 `alerts` 잡이 **월요일 09:00 UTC(=18:00 KST)**
 *       에만 호출한다. 주간 요약이므로 주 1회다.
 *
 * 보호: CRON_SECRET(?secret= / x-cron-secret) · x-vercel-cron · 관리자 세션.
 * dryRun: ?dry=1 이면 대상 수만 세고 발송하지 않는다.
 * fail-soft: hard-throw 하지 않고 JSON 요약을 반환한다.
 */

const BATCH = 500;

async function authorize(req: Request): Promise<boolean> {
  const expected = process.env.CRON_SECRET?.trim();
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";
  return (
    fromVercelCron ||
    (expected ? provided === expected : true) ||
    (await isAdminApiRequest())
  );
}

interface RunSummary {
  ok: boolean;
  dryRun: boolean;
  /** 옵트인한 사람 수 */
  optedIn: number;
  /** 실제 수신함에 남긴 수 */
  notified: number;
  /** 그중 웹푸시가 나간 구독 수 */
  pushSent: number;
  /** 보내지 않은 이유 (있을 때만) */
  skipped?: string;
}

async function pushToEmail(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  email: string,
  payload: PushPayload,
): Promise<number> {
  try {
    const { data, error } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_email", email)
      .limit(20);
    /* 못 읽은 것과 "구독 없음"은 다른 사실이다. 발송은 best-effort 라 계속하되
       못 읽었다는 것만은 로그에 남긴다(안 그러면 0건으로만 보인다). */
    if (error) {
      logger.warn(`[cron/weekly-digest] push_subscriptions 조회 실패 (${email})`, error);
      return 0;
    }
    const subs = (data ?? []) as Array<Record<string, unknown>>;
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
          // 개별 구독 실패는 무시 — 수신함에는 이미 남았다
        }
      }),
    );
    return sent;
  } catch (e) {
    captureException(e, { where: "cron/weekly-digest:push", email });
    return 0;
  }
}

async function run(dryRun: boolean): Promise<RunSummary> {
  const base: RunSummary = { ok: true, dryRun, optedIn: 0, notified: 0, pushSent: 0 };

  const sb = getServiceSupabase();
  if (!sb) return { ...base, skipped: "supabase-unconfigured" };

  const { data, error } = await sb
    .from("notification_preferences")
    .select("user_email")
    .eq("push_weekly_digest", true)
    .limit(BATCH);
  if (error) return { ...base, ok: false, skipped: error.message };

  const emails = [
    ...new Set(
      (data ?? [])
        .map((r) => String((r as { user_email?: unknown }).user_email ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const optedIn = emails.length;
  if (optedIn === 0) return { ...base, optedIn, skipped: "no-subscribers" };

  /* 보낼 내용이 실제로 있는지 먼저 확인. 빈 주는 발송하지 않는다.
     단, "빈 주"와 "조회 실패"를 같은 이유로 적지 않는다 — 조회가 실패한 걸
     empty 로 기록하면 나중에 로그만 보고 "그 주엔 소식이 없었다"고 오독한다. */
  let digest: Awaited<ReturnType<typeof getWeeklyDigest>>;
  try {
    digest = await getWeeklyDigest();
  } catch (e) {
    captureException(e, { where: "cron/weekly-digest" });
    return { ...base, optedIn, skipped: "digest-read-failed" };
  }
  const parts: string[] = [];
  if (digest.news.length > 0) parts.push(`뉴스 ${digest.news.length}건`);
  if (digest.market.length > 0) parts.push(`주요 지역 시세 ${digest.market.length}곳`);
  if (digest.community.count > 0) parts.push(`이웃 글 ${digest.community.count}건`);
  if (parts.length === 0) {
    const anyFailed =
      digest.failed.news || digest.failed.market || digest.failed.community;
    return { ...base, optedIn, skipped: anyFailed ? "digest-read-failed" : "empty" };
  }

  const title = `${digest.weekLabel} 주간 다이제스트`;
  const body = `이번 주 ${parts.join(" · ")}`;
  if (dryRun) return { ...base, optedIn, skipped: "dry-run" };

  const payload: PushPayload = {
    title,
    body,
    url: "/digest",
    tag: `weekly-digest-${digest.weekLabel}`,
    eventType: "generic",
  };

  let notified = 0;
  let pushSent = 0;
  for (const email of emails) {
    try {
      await appendInboxNotification({
        userEmail: email,
        title,
        body,
        actionUrl: "/digest",
      });
      notified += 1;
      pushSent += await pushToEmail(sb, email, payload);
    } catch (e) {
      captureException(e, { where: "cron/weekly-digest", email });
    }
  }

  return { ...base, optedIn, notified, pushSent };
}

async function handle(req: Request): Promise<Response> {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  try {
    return NextResponse.json(await run(dryRun));
  } catch (e) {
    captureException(e, { where: "cron/weekly-digest:handle" });
    logger.error("[cron/weekly-digest] 실패", e);
    return NextResponse.json({
      ok: false,
      dryRun,
      optedIn: 0,
      notified: 0,
      pushSent: 0,
      skipped: "exception",
    });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
