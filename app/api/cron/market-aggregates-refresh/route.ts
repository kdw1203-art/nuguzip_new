/**
 * 실거래 집계 MV 재계산 크론.
 *
 * 왜 별도 크론인가: `market_transactions` 에 쓰는 경로가 MOLIT 크론 하나가 아니다.
 * 플랫폼 ETL, 관리자 CSV 업로드(`POST /api/admin/molit-csv`)도 같은 표에 적재한다.
 * MOLIT 크론 뒤에만 갱신을 붙여 두면 다른 경로로 들어온 실거래가 `/tx` 랜딩과
 * 지도 시세 색상에 영영 반영되지 않는다. 하루 한 번(실측 8.75초) 재계산해
 * "어떤 경로로 들어왔든 하루 안에는 화면에 반영된다"를 보장한다.
 *
 * 보호: x-vercel-cron / CRON_SECRET / 관리자 세션. (다른 크론과 동일한 규칙)
 */
import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { refreshMarketAggregates } from "@/lib/market/refresh-aggregates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  const result = await refreshMarketAggregates();

  // 갱신 실패는 500 으로 드러낸다 — 조용히 성공처럼 보이면 오래된 집계가
  // 그대로 서비스되는 것을 아무도 눈치채지 못한다.
  return NextResponse.json(
    { ...result, finishedAt: new Date().toISOString() },
    { status: result.ok ? 200 : 500 },
  );
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
