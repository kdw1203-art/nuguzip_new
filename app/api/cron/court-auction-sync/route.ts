import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { syncCourtAuctions } from "@/lib/court-auction/sync";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 법원경매(court auction) 동기화 크론.
 * 보호: CRON_SECRET 또는 관리자 세션(온비드 크론과 동일 패턴).
 * 소스 키 미설정·미구현 시 syncCourtAuctions()가 skipped 로 정상 반환 — 하드 실패 없음.
 */
async function handle(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorized =
    fromVercelCron ||
    (expected ? provided === expected : true) ||
    (await isAdminApiRequest());
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  // F3(#147) — 던져서 끝나면 로그가 비어 "안 돌았다"와 구분되지 않으므로 예외도 기록한다.
  try {
    const result = await syncCourtAuctions();
    await logIngest({
      source: "court-auction",
      dataset: "법원경매 물건",
      origin: "cron-fetch",
      rows: result.inserted ?? 0,
      status: result.skipped ? "skipped" : result.ok ? "ok" : "error",
      message: result.reason,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = ingestErrorMessage(err, "법원경매 동기화 실패");
    await logIngest({
      source: "court-auction",
      dataset: "법원경매 물건",
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
