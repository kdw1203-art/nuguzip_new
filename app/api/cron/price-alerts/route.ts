import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorizeCron } from "@/lib/cron/authorize";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { getPrefs } from "@/lib/notification-prefs/store-db";
import { isNcpSensConfigured, sendSensSms } from "@/lib/ncp/sens-sms";
import { sendPush, type PushPayload } from "@/lib/push/vapid";
import { captureException } from "@/lib/monitoring/capture";
import { logger } from "@/lib/log";
import { resolveComplexPrice, type ComplexPriceResult } from "@/lib/market/complex-price";
import { formatKrwShort, formatYmRange } from "@/lib/market/format";
import { complexHrefFromId } from "@/lib/seo/complex-slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * #1 관심 단지 가격 변동 알림 크론.
 *
 * user_watchlist 행을 순회하며 각 단지의 현재가를 last_price_krw 와 비교한다.
 * 현재가는 lib/market/complex-price.ts 가 산출한다 — 거래가 가장 많은 전용면적
 * 구간의 최근 6건 평균(최소 3건).
 *
 * #150 이전에는 운영 DB에 존재하지 않는 `complex_transactions` 테이블의 최근월
 * 전면적 평균을 읽었다. 조회가 항상 null 이라 알림이 한 건도 나가지 않는 죽은
 * 경로였고, 그렇다고 "최근월 전면적 평균" 규칙을 그대로 옮기면 평형 구성이 바뀐 것을
 * 가격이 변한 것으로 오인해 대량 오알림이 난다(실측 근거는 complex-price.ts 주석).
 *
 * ▸ ±1% 이상 변동, 또는 alert_price_min/alert_price_max 경계를 새로 넘긴 경우 알림.
 * ▸ 알림 시 인앱 수신함에 적재하고 last_price_krw·last_price_band·last_notified_at 갱신.
 * ▸ 관측만 하고 알림이 없어도 기준가(last_price_krw·last_price_band)는 최신값으로 갱신.
 *
 * ⚠️ 대표 면적대가 바뀌면 알림하지 않고 기준가만 다시 세운다.
 *    59㎡ 평균과 84㎡ 평균의 차이는 가격 변동이 아니라 평형이 바뀐 것이다.
 *    이 판정에 user_watchlist.last_price_band 를 쓴다.
 *
 * ⚠️ 검증 한계(사실): 2026-07-25 기준 운영 DB의 user_watchlist 는 1행뿐이고, 그 1행은
 *    이 크론이 의도적으로 제외하는 지역 알림(complex_id="alert:region:서울 강남구")이다.
 *    실단지 관심 행이 0건이라 알림 발송까지의 종단 검증은 실데이터로 하지 못했다.
 *    가격 산출부(complex-price)는 운영 DB 실거래로 직접 검증했다.
 *
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 *       — onbid-sync 와 동일. 키 없으면 통과(개발/폴백).
 * fail-soft: 절대 hard-throw 하지 않고 JSON 요약을 반환한다.
 */

/** 한 번에 처리할 관심 단지 행 상한. */
const BATCH = 500;
/** 의미 있는 변동으로 간주할 최소 변화율(1%). */
const CHANGE_THRESHOLD = 0.01;

/**
 * 원(KRW) → "12.3억" / "8,400만원".
 *
 * 표기 규칙 자체는 lib/market/format.ts 가 갖는다(#150 이전에는 이 파일이 12번째
 * 사본을 들고 있었다). 다만 공용 헬퍼는 "9,800만" 처럼 '원' 을 붙이지 않는다 —
 * 문장 안에서 읽히는 알림 문구는 기존 표기("8,400만원")를 유지해야 하므로 여기서만 덧붙인다.
 */
function priceText(krw: number): string {
  const s = formatKrwShort(krw);
  return s.endsWith("만") ? `${s}원` : s;
}

/**
 * 알림 한 줄. "무엇을 근거로 그렇게 말하는지" 를 문장에 포함한다.
 * 평균의 대상(면적대)·표본 수·신고 기간을 빼면 "시세가 올랐다" 는 검증 불가능한
 * 주장이 된다. 실제로 산출한 것은 특정 면적대 최근 N건의 실거래 평균이다.
 */
function alertBody(name: string, price: ComplexPriceOk, dir: string): string {
  const period = formatYmRange(price.firstYm, price.latestYm);
  return (
    `${name} ${price.bandLabel} 실거래 평균이 ${priceText(price.priceKrw)}(으)로 ${dir}했어요.` +
    ` (최근 ${price.sampleSize}건${period ? ` · ${period} 신고 기준` : ""})`
  );
}

type ComplexPriceOk = Extract<ComplexPriceResult, { ok: true }>["price"];

interface RunSummary {
  ok: boolean;
  checked: number;
  notified: number;
  /** 인앱 알림 중 SMS(NCP SENS)로도 발송된 건수 (옵트인 사용자) */
  smsSent: number;
  /** 인앱 알림 중 웹푸시(VAPID)로도 발송된 구독 수 (구독자) */
  pushSent: number;
  skipped: number;
  /**
   * 건너뛴 사유별 건수. 대부분의 skip 은 버그가 아니라 "아직 판단할 근거가 없다"
   * 이므로(thin-sample·no-trades), 뭉뚱그리면 운영자가 고장과 구분할 수 없다.
   */
  skipReasons?: Record<string, number>;
  reason?: string;
}

/**
 * 옵트인 사용자에게 관심단지 가격 알림을 SMS(NCP SENS)로도 발송.
 * NCP SENS 미설정 시 조용히 no-op. 인앱 알림과 별개로 동작(실패해도 크론은 계속).
 */
async function maybeSendPriceAlertSms(
  userEmail: string,
  body: string,
  complexId: string,
): Promise<boolean> {
  if (!isNcpSensConfigured()) return false;
  try {
    const prefs = await getPrefs(userEmail);
    if (!prefs.smsPriceAlerts || !prefs.alertPhone) return false;
    const content =
      `[내집나우] 관심단지 실거래 알림\n` +
      `${body}\n` +
      `자세히: https://nuguzip.com${complexHrefFromId(complexId)}\n\n` +
      `수신거부: 마이 > 알림 설정`;
    const result = await sendSensSms({
      type: "LMS",
      contentType: "COMM",
      subject: "관심단지 실거래 알림",
      content,
      messages: [{ to: prefs.alertPhone }],
    });
    return result.ok;
  } catch (e) {
    captureException(e, { where: "cron/price-alerts:sms", userEmail });
    return false;
  }
}

/**
 * B4 관심단지 실거래 웹푸시 — 인앱 알림과 함께 사용자의 push_subscriptions 로 발송.
 * VAPID 미설정/구독 없음 시 조용히 no-op. best-effort(실패해도 크론 계속).
 * 반환: 발송 성공한 구독 수.
 */
async function maybeSendPriceAlertPush(
  sb: SupabaseClient,
  userEmail: string,
  body: string,
  complexId: string,
): Promise<number> {
  try {
    const { data, error } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_email", userEmail.toLowerCase())
      .limit(20);
    /* 못 읽은 것을 빈 배열로 흘려보내면 "이 사용자는 웹푸시를 구독하지 않았다"와
       구분이 안 된다 — 크론 요약에는 그냥 0건으로 적히고, 알림이 왜 안 갔는지
       나중에 알 길이 없다. 발송은 best-effort 라 계속하되(한 사람 때문에 크론
       전체를 접지 않는다), 못 읽었다는 사실은 로그에 남긴다. */
    if (error) {
      logger.warn(`[cron/price-alerts] push_subscriptions 조회 실패 (${userEmail})`, error);
      return 0;
    }
    const subs = (data ?? []) as Array<Record<string, unknown>>;
    if (subs.length === 0) return 0;
    const payload: PushPayload = {
      title: "관심 단지 가격 변동",
      body,
      url: complexHrefFromId(complexId),
      tag: `watchlist-${complexId}`,
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
          // 개별 구독 실패는 무시
        }
      }),
    );
    return sent;
  } catch (e) {
    captureException(e, { where: "cron/price-alerts:push", userEmail });
    return 0;
  }
}

async function runPriceAlerts(): Promise<RunSummary> {
  const read = getReadOnlySupabase();
  if (!read) {
    // 저장소 미설정 — 안전한 no-op.
    return {
      ok: true,
      checked: 0,
      notified: 0,
      smsSent: 0,
      pushSent: 0,
      skipped: 0,
      reason: "no-store",
    };
  }
  const write = getServiceSupabase();

  // 알림 구독(#47, complex_id="alert:%") 행은 관심 단지 알림 대상에서 제외.
  const { data, error } = await read
    .from("user_watchlist")
    .select(
      "id, user_email, complex_id, complex_name, alert_price_min, alert_price_max, last_price_krw, last_price_band",
    )
    .not("complex_id", "like", "alert:%")
    .limit(BATCH);

  if (error) {
    logger.warn("[cron/price-alerts] user_watchlist 조회 실패", error.message);
    return {
      ok: true,
      checked: 0,
      notified: 0,
      smsSent: 0,
      pushSent: 0,
      skipped: 0,
      reason: "query-failed",
    };
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  // 여러 사용자가 같은 단지를 볼 수 있으므로 단지 단위로 1회만 산출.
  const priceCache = new Map<string, ComplexPriceResult>();
  let checked = 0;
  let notified = 0;
  let smsSent = 0;
  let pushSent = 0;
  let skipped = 0;
  let sawPrice = false;
  const skipReasons: Record<string, number> = {};
  const noteSkip = (reason: string) => {
    skipped++;
    skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
  };

  for (const row of rows) {
    checked++;
    try {
      const complexId = String(row.complex_id ?? "");
      if (!complexId) {
        noteSkip("empty-complex-id");
        continue;
      }

      let result = priceCache.get(complexId);
      if (result === undefined) {
        result = await resolveComplexPrice(complexId, read);
        priceCache.set(complexId, result);
      }
      if (!result.ok) {
        noteSkip(result.reason);
        continue;
      }
      const price = result.price;
      const priceKrw = price.priceKrw;
      sawPrice = true;

      const prev = row.last_price_krw != null ? Number(row.last_price_krw) : null;
      const prevBand = row.last_price_band != null ? String(row.last_price_band) : null;
      const min = row.alert_price_min != null ? Number(row.alert_price_min) : null;
      const max = row.alert_price_max != null ? Number(row.alert_price_max) : null;

      /* 비교 가능성 판정이 먼저다.
         - prev 가 없다(최초 관측): 비교 대상이 없다.
         - prevBand 가 없다: #150 이전에 기록된 기준가라 어느 면적대의 값인지 모른다.
         - prevBand 가 지금과 다르다: 대표 평형이 바뀐 것이라 두 값은 애초에 같은
           것을 재고 있지 않다. 차이를 "변동" 이라 부르면 거짓이 된다.
         셋 다 알림하지 않고 기준가만 다시 세운다. */
      const comparable = prev !== null && prev > 0 && prevBand !== null && prevBand === price.bandSlug;

      let shouldNotify = false;
      if (comparable && prev !== null) {
        const pct = Math.abs(priceKrw - prev) / prev;
        const meaningful = pct >= CHANGE_THRESHOLD;
        // 경계를 "새로" 넘긴 경우에만(직전엔 안쪽, 지금은 바깥) 알림 — 중복 알림 방지.
        const crossedMin = min !== null && prev > min && priceKrw <= min;
        const crossedMax = max !== null && prev < max && priceKrw >= max;
        shouldNotify = meaningful || crossedMin || crossedMax;
      }

      if (shouldNotify && prev !== null) {
        const name = String(row.complex_name ?? "관심 단지");
        const dir = priceKrw >= prev ? "상승" : "하락";
        const body = alertBody(name, price, dir);
        const userEmail = String(row.user_email ?? "").trim();
        if (userEmail) {
          await appendInboxNotification({
            userEmail,
            title: "관심 단지 가격 변동",
            body,
            actionUrl: complexHrefFromId(complexId),
          });
          notified++;
          // 옵트인 사용자에게 SMS(NCP SENS)로도 발송 — 미설정/미동의 시 no-op
          if (await maybeSendPriceAlertSms(userEmail, body, complexId)) {
            smsSent++;
          }
          // B4 웹푸시(VAPID)로도 발송 — 구독 없음/미설정 시 no-op. write(service) 경유.
          if (write) {
            pushSent += await maybeSendPriceAlertPush(write, userEmail, body, complexId);
          }
        }
      }

      /* 기준가는 관측할 때마다 최신값으로 갱신(bookkeeping).
         금액이 같아도 대표 면적대가 바뀌었으면 반드시 같이 갱신해야 한다 —
         안 그러면 다음 회차에도 "구간이 다르다" 로 영원히 알림이 억제된다. */
      if (write) {
        const priceChanged = priceKrw !== prev;
        const bandChanged = price.bandSlug !== prevBand;
        if (priceChanged || bandChanged) {
          const update: Record<string, unknown> = {
            last_price_krw: priceKrw,
            last_price_band: price.bandSlug,
          };
          if (shouldNotify) update.last_notified_at = new Date().toISOString();
          await write.from("user_watchlist").update(update).eq("id", row.id);
        } else if (shouldNotify) {
          await write
            .from("user_watchlist")
            .update({ last_notified_at: new Date().toISOString() })
            .eq("id", row.id);
        }
      }
    } catch (e) {
      noteSkip("exception");
      captureException(e, {
        where: "cron/price-alerts",
        complexId: String(row.complex_id ?? ""),
      });
    }
  }

  // 단 한 건도 값을 못 구했으면 명시적으로 알린다 — 사유별 내역을 함께 남긴다.
  if (!sawPrice && rows.length > 0) {
    return {
      ok: true,
      checked,
      notified: 0,
      smsSent: 0,
      pushSent: 0,
      skipped,
      skipReasons,
      reason: "no-price-source",
    };
  }
  return {
    ok: true,
    checked,
    notified,
    smsSent,
    pushSent,
    skipped,
    ...(skipped > 0 ? { skipReasons } : {}),
  };
}

async function handle(req: Request): Promise<Response> {
  if (!(await authorizeCron(req))) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  try {
    const summary = await runPriceAlerts();
    return NextResponse.json(summary);
  } catch (e) {
    // fail-soft: 크론은 500 대신 요약을 반환한다.
    captureException(e, { where: "cron/price-alerts:handle" });
    logger.error("[cron/price-alerts] 실패", e);
    return NextResponse.json({ ok: false, checked: 0, notified: 0 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
