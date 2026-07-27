/**
 * GET /api/cron/reb-ingest
 * 한국부동산원(R-ONE) Open API → market_* 테이블 적재. Vercel Cron(3일 주기) 또는 수동 호출.
 * 보호: CRON_SECRET 또는 관리자 세션.
 */
import { NextResponse } from "next/server";
import { ingestReb } from "@/lib/reb/ingest";
import { isRebConfigured } from "@/lib/reb/client";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { withBudget, CRON_WORK_BUDGET_MS } from "@/lib/async/with-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  if (!isRebConfigured()) {
    return NextResponse.json(
      { ok: false, skipped: true, message: "REB_OPENAPI_KEY 미설정" },
      { status: 200 },
    );
  }

  const monthPages = Number(url.searchParams.get("monthPages") ?? "3") || 3;
  const weekPages = Number(url.searchParams.get("weekPages") ?? "4") || 4;

  /* F3(#147) — 성공 로그는 ingestReb() 안에서 남는다. 실패는 여기서만 남길 수 있다.
     상한을 두는 이유: maxDuration=300 을 다 태우고 죽으면 아래 logIngest 까지
     못 가서 실행 흔적이 통째로 사라진다(= 어드민 신선도 화면에서 "안 돌았다"로
     보인다). 270초에 스스로 접으면 "잘렸다"는 사실을 남길 수 있다. */
  const run = await withBudget(
    Promise.resolve().then(() => ingestReb({ monthPages, weekPages })),
    CRON_WORK_BUDGET_MS,
  );

  if (run.state === "timeout") {
    const message = `시간 초과로 중단 (${Math.round(CRON_WORK_BUDGET_MS / 1000)}초) — 다음 실행에서 이어서`;
    await logIngest({
      source: "reb",
      dataset: "all",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message, timedOut: true }, { status: 503 });
  }

  if (run.state === "error") {
    const message = ingestErrorMessage(run.error, "REB 수집 실패");
    await logIngest({
      source: "reb",
      dataset: "all",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  return NextResponse.json(run.value);
}
