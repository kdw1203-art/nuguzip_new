import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { captureException } from "@/lib/monitoring/capture";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * #1 관심 단지 가격 변동 알림 크론.
 *
 * user_watchlist 행을 순회하며 각 단지의 현재 시세(국토부 실거래 캐시
 * complex_transactions 최근월 전체 평균가)를 last_price_krw 와 비교한다.
 * ▸ ±1% 이상 변동, 또는 alert_price_min/alert_price_max 경계를 새로 넘긴 경우 알림.
 * ▸ 알림 시 인앱 수신함에 적재하고 last_price_krw·last_notified_at 갱신.
 * ▸ 관측만 하고 알림이 없어도 last_price_krw(기준가)는 최신값으로 갱신(bookkeeping).
 *
 * 보호: CRON_SECRET(?secret= / x-cron-secret) · x-vercel-cron · 관리자 세션
 *       — onbid-sync 와 동일. 키 없으면 통과(개발/폴백).
 * fail-soft: 절대 hard-throw 하지 않고 JSON 요약을 반환한다.
 */

/** 한 번에 처리할 관심 단지 행 상한. */
const BATCH = 500;
/** 의미 있는 변동으로 간주할 최소 변화율(1%). */
const CHANGE_THRESHOLD = 0.01;

async function authorize(req: Request): Promise<boolean> {
  const expected = process.env.CRON_SECRET?.trim();
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";
  return (
    fromVercelCron ||
    (expected ? provided === expected : true) ||
    (await isAdminApiRequest())
  );
}

/**
 * 단지 현재 시세(원). complex_transactions 의 최근월 전체(면적 무관) 평균 실거래가
 * avg_manwon(만원) × 10,000. 조회 실패/미존재 시 null.
 */
async function resolveComplexPriceKrw(
  read: SupabaseClient,
  complexId: string,
): Promise<number | null> {
  try {
    const { data } = await read
      .from("complex_transactions")
      .select("avg_manwon, yyyymm")
      .eq("complex_id", complexId)
      .is("area_m2", null)
      .order("yyyymm", { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = data as Record<string, unknown> | null;
    const manwon = raw?.avg_manwon != null ? Number(raw.avg_manwon) : null;
    if (manwon === null || !Number.isFinite(manwon) || manwon <= 0) return null;
    return Math.round(manwon * 10_000);
  } catch {
    return null;
  }
}

/** 원(KRW) → "12.3억" / "8,400만원" 짧은 표기. */
function formatKrwShort(krw: number): string {
  if (krw >= 1e8) {
    const eok = Math.round((krw / 1e8) * 10) / 10;
    return `${eok.toLocaleString("ko-KR")}억`;
  }
  return `${Math.round(krw / 1e4).toLocaleString("ko-KR")}만원`;
}

interface RunSummary {
  ok: boolean;
  checked: number;
  notified: number;
  skipped: number;
  reason?: string;
}

async function runPriceAlerts(): Promise<RunSummary> {
  const read = getReadOnlySupabase();
  if (!read) {
    // 저장소 미설정 — 안전한 no-op.
    return { ok: true, checked: 0, notified: 0, skipped: 0, reason: "no-store" };
  }
  const write = getServiceSupabase();

  // 알림 구독(#47, complex_id="alert:%") 행은 관심 단지 알림 대상에서 제외.
  const { data, error } = await read
    .from("user_watchlist")
    .select(
      "id, user_email, complex_id, complex_name, alert_price_min, alert_price_max, last_price_krw",
    )
    .not("complex_id", "like", "alert:%")
    .limit(BATCH);

  if (error) {
    logger.warn("[cron/price-alerts] user_watchlist 조회 실패", error.message);
    return {
      ok: true,
      checked: 0,
      notified: 0,
      skipped: 0,
      reason: "query-failed",
    };
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  // 여러 사용자가 같은 단지를 볼 수 있으므로 단지 단위로 시세를 1회만 조회.
  const priceCache = new Map<string, number | null>();
  let checked = 0;
  let notified = 0;
  let skipped = 0;
  let sawPrice = false;

  for (const row of rows) {
    checked++;
    try {
      const complexId = String(row.complex_id ?? "");
      if (!complexId) {
        skipped++;
        continue;
      }

      let priceKrw = priceCache.get(complexId);
      if (priceKrw === undefined) {
        priceKrw = await resolveComplexPriceKrw(read, complexId);
        priceCache.set(complexId, priceKrw);
      }
      if (priceKrw === null) {
        skipped++;
        continue;
      }
      sawPrice = true;

      const prev = row.last_price_krw != null ? Number(row.last_price_krw) : null;
      const min = row.alert_price_min != null ? Number(row.alert_price_min) : null;
      const max = row.alert_price_max != null ? Number(row.alert_price_max) : null;

      // 최초 관측(prev 없음)은 기준가만 기록하고 알림하지 않는다.
      let shouldNotify = false;
      if (prev !== null && prev > 0) {
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
        const userEmail = String(row.user_email ?? "").trim();
        if (userEmail) {
          await appendInboxNotification({
            userEmail,
            title: "관심 단지 가격 변동",
            body: `${name} 시세가 ${formatKrwShort(priceKrw)}(으)로 ${dir}했어요.`,
            actionUrl: `/complex/${complexId}`,
          });
          notified++;
        }
      }

      // 기준가는 관측할 때마다 최신값으로 갱신(bookkeeping);
      // 알림을 보낸 경우에만 last_notified_at 도 함께 기록.
      if (write) {
        if (priceKrw !== prev) {
          const update: Record<string, unknown> = { last_price_krw: priceKrw };
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
      skipped++;
      captureException(e, {
        where: "cron/price-alerts",
        complexId: String(row.complex_id ?? ""),
      });
    }
  }

  // 단 한 건도 시세를 못 구했으면(가격 소스 없음) 명시적으로 알린다.
  if (!sawPrice && rows.length > 0) {
    return { ok: true, checked, notified: 0, skipped, reason: "no-price-source" };
  }
  return { ok: true, checked, notified, skipped };
}

async function handle(req: Request): Promise<Response> {
  if (!(await authorize(req))) {
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
