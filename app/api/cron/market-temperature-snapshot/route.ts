/**
 * N11 — 시장 온도 주간 스냅샷 크론.
 *
 * 매 실행마다 대상 지역 전체의 현재 온도를 계산해 **이번 주 행**에 upsert 한다.
 * 하루 두 번 돌아도 결과는 그 주의 행 하나뿐이고, 주가 바뀌면 지난주 값이
 * 그대로 굳는다. 저장값의 정의는 "그 주에 마지막으로 관측한 온도"다.
 *
 * 순서 주의: 반드시 market-aggregates-refresh **뒤에** 부른다. 거래량 항은
 * market_region_monthly 를 읽는데, 그 표가 갱신되기 전에 온도를 재면 어제
 * 집계로 이번 주 값을 굳히게 된다.
 *
 * 보호: x-vercel-cron / CRON_SECRET / 관리자 세션. (다른 크론과 동일한 규칙)
 */
import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { runTemperatureSnapshot } from "@/lib/market/temperature-archive";

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

  const result = await runTemperatureSnapshot();

  /* 일부 지역이 "지수 시계열 없음"으로 건너뛰는 건 실패가 아니다(근거가 없는
     것이지 조회가 깨진 게 아니다). 반대로 upsert 실패나 계산 중 예외는 500 으로
     드러낸다 — 조용히 200 을 주면 아카이브에 구멍이 뚫린 걸 아무도 모른다. */
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
