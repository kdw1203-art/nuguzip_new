import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { isEcosConfigured } from "@/lib/ecos/client";
import { syncEcosKeyStats } from "@/lib/ecos/sync";
import { logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ECOS 100대 통계지표(기준금리 등) 동기화 크론.
 * 보호: CRON_SECRET 또는 관리자 세션. ECOS_API_KEY 없으면 skipped(정상 폴백).
 */
export async function GET(req: Request) {
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
  if (!isEcosConfigured()) {
    await logIngest({
      source: "ecos",
      dataset: "한국은행 100대 통계지표",
      origin: "cron-fetch",
      rows: 0,
      status: "skipped",
      message: "ECOS_API_KEY 미설정",
    });
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: "ECOS_API_KEY 미설정 — 설정 시 기준금리 등 지표가 자동 적재됩니다.",
    });
  }
  const result = await syncEcosKeyStats();
  // F3 — 적재 로그
  await logIngest({
    source: "ecos",
    dataset: "한국은행 100대 통계지표",
    origin: "cron-fetch",
    rows: result.count ?? 0,
    status: result.ok ? "ok" : result.skipped ? "skipped" : "error",
    message: result.reason ?? (result.baseRate ? `기준금리 ${result.baseRate}` : undefined),
  });
  return NextResponse.json(result);
}
