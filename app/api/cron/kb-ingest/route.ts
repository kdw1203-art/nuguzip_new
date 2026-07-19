/**
 * GET /api/cron/kb-ingest
 * KB 데이터는 공개 자동 다운로드 URL이 불안정하므로 기본은 "수동 업로드" 정책.
 * KB_CRAWL_ENABLED=1 + KB_TIMESERIES_URL 가 설정된 경우에만 best-effort 자동 수집.
 * 보호: CRON_SECRET / x-vercel-cron / 관리자.
 */
import { NextResponse } from "next/server";
import { ingestKbWorkbook } from "@/lib/kb/ingest";
import { isAdminApiRequest } from "@/lib/admin/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorized =
    fromVercelCron || (expected ? provided === expected : true) || (await isAdminApiRequest());
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
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "KB 수집 실패" },
      { status: 500 },
    );
  }
}
