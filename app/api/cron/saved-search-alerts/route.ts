import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import {
  listAlertEnabledSavedSearches,
  markSavedSearchChecked,
} from "@/lib/saved-search/store";
import {
  countSavedSearchMatches,
  scopeActionUrl,
} from "@/lib/saved-search/alert-matcher";
import { SCOPE_LABELS } from "@/lib/saved-search/types";
import { captureException } from "@/lib/monitoring/capture";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 저장 검색(조건) 알림 크론 — B1.
 *
 * saved_searches 의 alert_enabled·last_checked_at·last_match_count 는 스키마·UI만 있고
 * 실제로 도는 러너가 없어 알림이 나가지 않았다. 이 크론이 그 루프를 완성한다.
 *
 * 동작: 알림 켜진 저장 검색을 순회하며 scope+query 의 현재 매치 수를 센다.
 * ▸ 최초 관측(last_checked_at null)은 기준선만 기록하고 알림하지 않는다.
 * ▸ 이후 매치 수가 이전보다 늘면(신규 결과) 인앱 수신함에 알림.
 * ▸ 항상 last_checked_at·last_match_count 를 최신값으로 갱신(bookkeeping).
 *
 * 보호: CRON_SECRET(?secret=/x-cron-secret) · x-vercel-cron · 관리자 세션 — price-alerts 와 동일.
 * fail-soft: hard-throw 하지 않고 JSON 요약 반환.
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
  checked: number;
  notified: number;
  skipped: number;
  reason?: string;
}

async function runSavedSearchAlerts(): Promise<RunSummary> {
  const read = getReadOnlySupabase();
  if (!read) return { ok: true, checked: 0, notified: 0, skipped: 0, reason: "no-store" };

  const searches = await listAlertEnabledSavedSearches(BATCH);
  let checked = 0;
  let notified = 0;
  let skipped = 0;

  for (const s of searches) {
    checked++;
    try {
      const count = await countSavedSearchMatches(read, s.scope, s.query);
      // 카운트를 못 구함(조회 실패/광범위 무검색어) → 이번 회차 스킵(갱신도 하지 않음)
      if (count === null) {
        skipped++;
        continue;
      }

      const firstObservation = s.lastCheckedAt === null;
      const grew = !firstObservation && count > s.lastMatchCount;

      if (grew) {
        const delta = count - s.lastMatchCount;
        const email = s.userEmail.trim();
        if (email) {
          await appendInboxNotification({
            userEmail: email,
            title: "저장검색 새 결과",
            body: `'${s.label}'(${SCOPE_LABELS[s.scope]})에 새 결과 ${delta.toLocaleString(
              "ko-KR",
            )}건이 있어요.`,
            actionUrl: scopeActionUrl(s.scope, s.query),
          });
          notified++;
        }
      }

      // 항상 기준선 갱신(최초 관측·증가·감소 모두). 다음 회차 비교 기준.
      await markSavedSearchChecked(s.id, count);
    } catch (e) {
      skipped++;
      captureException(e, { where: "cron/saved-search-alerts", id: s.id });
    }
  }

  return { ok: true, checked, notified, skipped };
}

async function handle(req: Request): Promise<Response> {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  try {
    const summary = await runSavedSearchAlerts();
    return NextResponse.json(summary);
  } catch (e) {
    captureException(e, { where: "cron/saved-search-alerts:handle" });
    logger.error("[cron/saved-search-alerts] 실패", e);
    return NextResponse.json({ ok: false, checked: 0, notified: 0, skipped: 0 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
