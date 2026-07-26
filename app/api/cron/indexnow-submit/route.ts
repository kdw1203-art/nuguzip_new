/**
 * N1 — IndexNow 제출 크론.
 *
 * 무엇을 보내는가 (= 실제로 자주 바뀌는 것만):
 *   1) 이번 달·직전 달 월간 리포트 — 실거래 신고가 매일 들어와 수치가 계속 변한다.
 *   2) 최근 7일 안에 갱신된 공개 임장노트 — 새 URL 이 생기는 유일한 사용자 경로.
 *   3) 데이터가 매일 갱신되는 허브 3개(/reports·/tx·/).
 *
 * 왜 전체를 안 보내는가: 안 바뀐 URL 을 매일 밀어 넣는 건 프로토콜 남용이고,
 * 스팸으로 분류되면 도메인 단위로 무시당한다. 사이트 전체 색인은 사이트맵의 일이다.
 *
 * 보호: x-vercel-cron / CRON_SECRET / 관리자 세션 (다른 크론과 동일한 규칙).
 * 스케줄러는 .github/workflows/etl.yml — 이 서비스의 유일한 스케줄러다.
 */
import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { submitIndexNow } from "@/lib/seo/indexnow";
import { listReportMonths } from "@/lib/reports/monthly";
import { listPublicNotes } from "@/lib/inspection/store-db";
import { withBudget } from "@/lib/async/with-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://nuguzip.com";
const NOTE_FRESH_DAYS = 7;

/** 데이터가 매일 갱신되는 허브 — 여기는 "바뀌었다"가 사실이다. */
const DAILY_HUBS = ["/", "/reports", "/tx"];

/**
 * 수집에 주는 시간(ms). 이 라우트는 maxDuration=60 이라 수집이 늦어지면 제출도
 * 못 해 보고 통째로 죽는다(실제로 60초 타임아웃으로 죽은 기록이 있다). 25초에
 * 접으면 남은 시간으로 허브 3개라도 제출하고, 무엇이 빠졌는지 응답에 남긴다.
 */
const COLLECT_BUDGET_MS = 25_000;

type Collected = {
  urls: string[];
  detail: Record<string, number>;
  /** 조회에 실패해서 빠진 블록. 비어 있음(0건)과 구분하기 위해 따로 싣는다. */
  missing: string[];
};

async function collectUrls(): Promise<Collected> {
  const urls: string[] = DAILY_HUBS.map((p) => `${BASE}${p}`);
  const detail: Record<string, number> = { hubs: DAILY_HUBS.length, reports: 0, notes: 0 };
  const missing: string[] = [];

  /* 둘을 나란히 돌린다 — 순차로 돌리면 예산이 두 배로 쌓여 25초 상한이 50초가
     되고, maxDuration=60 안에 제출까지 끝낼 여유가 없어진다. */
  const [monthsRun, notesRun] = await Promise.all([
    withBudget(
      Promise.resolve().then(() => listReportMonths()),
      COLLECT_BUDGET_MS,
    ),
    withBudget(
      Promise.resolve().then(() => listPublicNotes(200)),
      COLLECT_BUDGET_MS,
    ),
  ]);

  // 최신 2개월 리포트 — 신고 지연 때문에 이 두 달의 수치만 계속 움직인다.
  /* 실패해도 제출 자체를 포기하지는 않는다(허브는 여전히 보낼 값어치가 있다).
     다만 reports: 0 을 "이번 달 리포트가 없다"로 읽으면 안 되므로 missing 에 남긴다. */
  if (monthsRun.state === "ok") {
    const recent = monthsRun.value.slice(0, 2);
    for (const m of recent) urls.push(`${BASE}/reports/${m.ym}`);
    detail.reports = recent.length;
  } else {
    missing.push(monthsRun.state === "timeout" ? "reports(시간 초과)" : "reports(조회 실패)");
  }

  // 최근 7일 내 갱신된 공개 노트
  if (notesRun.state === "ok") {
    const cutoff = Date.now() - NOTE_FRESH_DAYS * 24 * 60 * 60 * 1000;
    const fresh = notesRun.value.filter((n) => {
      if (!n.isPublic) return false;
      const t = n.updatedAt ? new Date(n.updatedAt).getTime() : NaN;
      return Number.isFinite(t) && t >= cutoff;
    });
    for (const n of fresh) urls.push(`${BASE}/notes/${n.id}`);
    detail.notes = fresh.length;
  } else {
    missing.push(notesRun.state === "timeout" ? "notes(시간 초과)" : "notes(조회 실패)");
  }

  return { urls, detail, missing };
}

async function handle(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorized =
    fromVercelCron || (expected ? provided === expected : true) || (await isAdminApiRequest());
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const { urls, detail, missing } = await collectUrls();

  // dryRun=1 이면 무엇을 보낼지만 확인한다(운영에서 눈으로 점검할 때 쓴다).
  if (url.searchParams.get("dryRun") === "1") {
    return NextResponse.json({ dryRun: true, count: urls.length, detail, missing, urls });
  }

  const result = await submitIndexNow(urls);
  return NextResponse.json(
    {
      ok: result.ok,
      submitted: result.submitted,
      status: result.status,
      message: result.message,
      detail,
      /* 빠진 블록이 있으면 숨기지 않는다 — detail.notes === 0 이 "새 노트가 없다"
         인지 "못 읽었다"인지는 여기를 봐야 구분된다. */
      ...(missing.length > 0 ? { missing } : {}),
      finishedAt: new Date().toISOString(),
    },
    // 제출 실패를 200 으로 감추지 않는다 — 조용히 죽으면 아무도 모른다.
    { status: result.ok ? 200 : 500 },
  );
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
