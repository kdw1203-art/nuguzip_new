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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://nuguzip.com";
const NOTE_FRESH_DAYS = 7;

/** 데이터가 매일 갱신되는 허브 — 여기는 "바뀌었다"가 사실이다. */
const DAILY_HUBS = ["/", "/reports", "/tx"];

async function collectUrls(): Promise<{ urls: string[]; detail: Record<string, number> }> {
  const urls: string[] = DAILY_HUBS.map((p) => `${BASE}${p}`);
  const detail: Record<string, number> = { hubs: DAILY_HUBS.length, reports: 0, notes: 0 };

  // 최신 2개월 리포트 — 신고 지연 때문에 이 두 달의 수치만 계속 움직인다.
  try {
    const months = await listReportMonths();
    const recent = months.slice(0, 2);
    for (const m of recent) urls.push(`${BASE}/reports/${m.ym}`);
    detail.reports = recent.length;
  } catch {
    // 조회 실패 시 그 블록만 생략 — 제출 자체를 포기하지 않는다.
  }

  // 최근 7일 내 갱신된 공개 노트
  try {
    const cutoff = Date.now() - NOTE_FRESH_DAYS * 24 * 60 * 60 * 1000;
    const notes = await listPublicNotes(200);
    const fresh = notes.filter((n) => {
      if (!n.isPublic) return false;
      const t = n.updatedAt ? new Date(n.updatedAt).getTime() : NaN;
      return Number.isFinite(t) && t >= cutoff;
    });
    for (const n of fresh) urls.push(`${BASE}/notes/${n.id}`);
    detail.notes = fresh.length;
  } catch {
    // 생략
  }

  return { urls, detail };
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

  const { urls, detail } = await collectUrls();

  // dryRun=1 이면 무엇을 보낼지만 확인한다(운영에서 눈으로 점검할 때 쓴다).
  if (url.searchParams.get("dryRun") === "1") {
    return NextResponse.json({ dryRun: true, count: urls.length, detail, urls });
  }

  const result = await submitIndexNow(urls);
  return NextResponse.json(
    {
      ok: result.ok,
      submitted: result.submitted,
      status: result.status,
      message: result.message,
      detail,
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
