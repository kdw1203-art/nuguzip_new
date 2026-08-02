import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { isEcosConfigured } from "@/lib/ecos/client";
import { syncEcosKeyStats } from "@/lib/ecos/sync";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ECOS 100대 통계지표(기준금리 등) 동기화 크론.
 * 보호: CRON_SECRET 또는 관리자 세션. ECOS_API_KEY 없으면 skipped(정상 폴백).
 */
export async function GET(req: Request) {
  const authorized = await authorizeCron(req);
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
  // F3(#147) — 던져서 끝나면 로그가 비어 "안 돌았다"와 구분되지 않으므로 예외도 기록한다.
  try {
    const result = await syncEcosKeyStats();
    await logIngest({
      source: "ecos",
      dataset: "한국은행 100대 통계지표",
      origin: "cron-fetch",
      rows: result.count ?? 0,
      status: result.ok ? "ok" : result.skipped ? "skipped" : "error",
      message: result.reason ?? (result.baseRate ? `기준금리 ${result.baseRate}` : undefined),
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = ingestErrorMessage(err, "ECOS 동기화 실패");
    await logIngest({
      source: "ecos",
      dataset: "한국은행 100대 통계지표",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
