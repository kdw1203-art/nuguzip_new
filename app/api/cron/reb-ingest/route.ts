/**
 * GET /api/cron/reb-ingest
 * 한국부동산원(R-ONE) Open API → market_* 테이블 적재. Vercel Cron(3일 주기) 또는 수동 호출.
 * 보호: CRON_SECRET 또는 관리자 세션.
 */
import { NextResponse } from "next/server";
import { ingestReb } from "@/lib/reb/ingest";
import { isRebConfigured } from "@/lib/reb/client";
import { isAdminApiRequest } from "@/lib/admin/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";

  const authorized =
    fromVercelCron ||
    (expected ? provided === expected : true) ||
    (await isAdminApiRequest());
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

  try {
    const result = await ingestReb({ monthPages, weekPages });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "수집 실패" },
      { status: 500 },
    );
  }
}
