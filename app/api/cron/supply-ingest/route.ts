/**
 * [개선 #21] 입주 예정 물량 자동 인제스트 크론.
 * 출처: 청약홈 분양정보 상세(getAPTLttotPblancDetail)의 입주예정월.
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 * DATA_GO_KR_SERVICE_KEY 미설정 시 no-op(reason:"no-key") — 기존 데이터 유지.
 * 스케줄: .github/workflows/etl.yml (매일 06:00 UTC) — vercel.json 에 두지 않는다.
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestApplyhomeSupply } from "@/lib/market/supply-ingest";
import { backfillSupplyGeocode } from "@/lib/market/supply-geocode";
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
    const result = await ingestApplyhomeSupply();
    await logIngest({
      source: "supply",
      dataset: "청약홈 분양공고 입주예정월",
      origin: "cron-fetch",
      rows: result.upserted + result.migrated,
      status: !result.configured ? "skipped" : "ok",
      message:
        result.reason ??
        `조회=${result.fetched} 업서트=${result.upserted} 이관=${result.migrated} 입주월없음/과거=${result.skippedNoMoveIn} 페이지=${result.pagesFetched}`,
    });
    /* [#74] 좌표 점진 백필(일 25건) — 지도 레이어용. 실패해도 인제스트 성공은 유지. */
    let geocode: Awaited<ReturnType<typeof backfillSupplyGeocode>> | { error: string } | null =
      null;
    try {
      geocode = await backfillSupplyGeocode(25);
    } catch (e) {
      geocode = { error: e instanceof Error ? e.message : "지오코딩 실패" };
    }
    return NextResponse.json({
      ok: true,
      mode: result.configured ? "live" : "mock",
      ...result,
      geocode,
    });
  } catch (err) {
    const message = ingestErrorMessage(err, "입주물량 적재 실패");
    await logIngest({
      source: "supply",
      dataset: "청약홈 분양공고 입주예정월",
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
