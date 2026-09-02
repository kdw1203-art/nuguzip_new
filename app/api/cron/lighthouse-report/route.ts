import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { loadLastGood, saveLastGood } from "@/lib/cache/last-good";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { resolveProjectAdminEmail } from "@/lib/auth/admin-emails";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * [945 · 실사용50 #45] Lighthouse 점수 수신 → 회귀 경보.
 *
 * 주간 lighthouse.yml 은 지금까지 측정만 하고 아무에게도 말하지 않았다 —
 * 점수가 무너져도 Actions 로그를 열어봐야 알았다. 이 라우트가 워크플로 끝에서
 * 점수를 받아 직전 저장본과 비교하고, 회귀만 경보로 승격한다.
 *
 * 판정(성능 점수 0~100):
 *  - 직전 대비 10점 이상 하락 → 회귀 경보
 *  - 절대값 70 미만(직전 기록 유무 무관) → 저성능 경보
 *  - ±9점 이내 등락은 침묵 — 랩 측정 노이즈다. 경보가 소음이 되면 아무도 안 읽는다.
 *
 * 경보 채널 = 기존 파이프라인 재사용: logger.error(운영 오류 수집·주간 브리핑이
 * 읽는다) + 관리자 수신함 ops 채널([HEALTH]). 저장은 last-good(public_data_cache,
 * 21일 창 — 주 1회 측정이라 2회분 여유).
 */

type ScoreRow = {
  url: string;
  performance: number;
  accessibility?: number;
  seo?: number;
};

const CACHE_KEY = "lighthouse-scores";
const MAX_AGE_HOURS = 21 * 24;
const DROP_THRESHOLD = 10;
const ABSOLUTE_FLOOR = 70;

export async function POST(req: Request) {
  if (!(await authorizeCron(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { scores?: ScoreRow[] };
  const scores = (Array.isArray(body.scores) ? body.scores : [])
    .filter(
      (s): s is ScoreRow =>
        typeof s?.url === "string" &&
        s.url.startsWith("https://naezipnow.com") &&
        Number.isFinite(s?.performance),
    )
    .slice(0, 12)
    .map((s) => ({
      url: s.url,
      performance: Math.max(0, Math.min(100, Math.round(s.performance))),
      accessibility: Number.isFinite(s.accessibility)
        ? Math.round(s.accessibility as number)
        : undefined,
      seo: Number.isFinite(s.seo) ? Math.round(s.seo as number) : undefined,
    }));
  if (scores.length === 0) {
    return NextResponse.json({ error: "scores 배열이 필요합니다." }, { status: 400 });
  }

  const prev = await loadLastGood<ScoreRow[]>(CACHE_KEY, MAX_AGE_HOURS);
  const prevByUrl = new Map((prev?.value ?? []).map((s) => [s.url, s]));

  const alerts: string[] = [];
  for (const cur of scores) {
    const before = prevByUrl.get(cur.url);
    const path = cur.url.replace("https://naezipnow.com", "") || "/";
    if (before && before.performance - cur.performance >= DROP_THRESHOLD) {
      alerts.push(
        `${path} 성능 ${before.performance}→${cur.performance} (-${before.performance - cur.performance})`,
      );
    } else if (cur.performance < ABSOLUTE_FLOOR) {
      alerts.push(`${path} 성능 ${cur.performance} (기준 ${ABSOLUTE_FLOOR} 미만)`);
    }
  }

  if (alerts.length > 0) {
    const msg = `[lighthouse] 속도 회귀 — ${alerts.join(" · ")}. 상세: GitHub Actions lighthouse-budget 최근 실행.`;
    logger.error(msg);
    const adminEmail = resolveProjectAdminEmail();
    if (adminEmail) {
      await appendInboxNotification({
        userEmail: adminEmail,
        title: "속도 회귀 감지 (주간 Lighthouse)",
        body: `[HEALTH] ${msg}`,
        actionUrl: "/admin/perf",
      }).catch(() => {});
    }
  }

  await saveLastGood(CACHE_KEY, scores);
  return NextResponse.json({
    ok: true,
    stored: scores.length,
    regressions: alerts.length,
    comparedAgainst: prev?.fetchedAt ?? null,
  });
}
