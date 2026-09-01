import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { publishRegionIntroPosts } from "@/lib/content/region-intro-post";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * [945 · 실사용50 #1] 동네 데이터 브리핑 월간 발행.
 * 멱등(지역×월)이라 매일 불려도 첫 성공 후엔 no-op — etl.yml 데일리에 편승한다.
 * 보호: CRON_SECRET · 관리자 세션.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const limit = Math.min(120, Math.max(1, Number(url.searchParams.get("limit") ?? "40") || 40));
  try {
    const r = await publishRegionIntroPosts(limit);
    await logIngest({
      source: "news",
      dataset: "동네 데이터 브리핑",
      origin: "cron-fetch",
      rows: r.posted,
      status: "ok",
      message: `발행 ${r.posted} · 기존 ${r.skippedExisting} · 데이터없음 ${r.skippedNoData} · 실패 ${r.failed}`,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    const message = ingestErrorMessage(err, "동네 브리핑 발행 실패");
    await logIngest({
      source: "news",
      dataset: "동네 데이터 브리핑",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
