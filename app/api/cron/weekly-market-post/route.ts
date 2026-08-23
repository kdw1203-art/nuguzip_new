/**
 * [#111·#116] 주간 시황 자동 발행 크론.
 * 보호: CRON_SECRET · 관리자 세션. 멱등: external_key(weekly-market:주차).
 * 스케줄: .github/workflows/etl.yml — 월요일만 (수동 실행 시 항상 시도, 멱등이 지킨다).
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { publishWeeklyMarketPost } from "@/lib/content/weekly-post";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  try {
    const result = await publishWeeklyMarketPost();
    await logIngest({
      source: "news",
      dataset: "주간 시황 자동 발행",
      origin: "cron-fetch",
      rows: result.posted ? 1 : 0,
      status: "ok",
      message: result.posted ? `발행 ${result.postId}` : (result.reason ?? "미발행"),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = ingestErrorMessage(err, "주간 시황 발행 실패");
    await logIngest({
      source: "news",
      dataset: "주간 시황 자동 발행",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
