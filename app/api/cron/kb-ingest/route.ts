/**
 * GET /api/cron/kb-ingest
 * KB 데이터는 공개 자동 다운로드 URL이 불안정하므로 기본은 "수동 업로드" 정책.
 * KB_CRAWL_ENABLED=1 + KB_TIMESERIES_URL 가 설정된 경우에만 best-effort 자동 수집.
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 */
import { NextResponse } from "next/server";
import { ingestKbWorkbook } from "@/lib/kb/ingest";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const enabled = process.env.KB_CRAWL_ENABLED === "1";
  const sourceUrl = process.env.KB_TIMESERIES_URL?.trim();
  if (!enabled || !sourceUrl) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      message:
        "KB 자동 수집 비활성(기본). 관리자 페이지(/admin/market)에서 KB 시계열 .xlsx 를 업로드하세요.",
    });
  }

  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`KB fetch HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const result = await ingestKbWorkbook(buffer);
    return NextResponse.json(result);
  } catch (err) {
    // F3(#147) — 성공 로그는 ingestKbWorkbook() 안에서 남는다. 실패는 여기서만 남길 수 있다.
    const message = ingestErrorMessage(err, "KB 수집 실패");
    await logIngest({
      source: "kb",
      dataset: "KB 시계열 자동 수집",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
