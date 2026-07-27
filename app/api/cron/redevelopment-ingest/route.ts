/**
 * 정비사업장 공공 API 적재 크론 (서울 열린데이터광장).
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 * SEOUL_OPENAPI_KEY 미설정 시 no-op(mode:"mock", reason:"no-key"),
 * 키는 있어도 실 데이터셋 서비스명(SEOUL_OPENAPI_SERVICE) 미지정 시
 * no-op(reason:"source-not-configured") — 둘 다 시드/DB 유지.
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestSeoulRedevelopment, isRedevIngestConfigured } from "@/lib/redevelopment/ingest";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const configured = isRedevIngestConfigured();
  // F3(#147) — 던져서 끝나면 로그가 비어 "안 돌았다"와 구분되지 않으므로 예외도 기록한다.
  try {
    const result = await ingestSeoulRedevelopment();
    await logIngest({
      source: "redevelopment",
      dataset: "서울 정비사업 현황",
      origin: "cron-fetch",
      rows: result.upserted,
      status: !configured ? "skipped" : result.upserted > 0 ? "ok" : "skipped",
      message:
        result.reason ??
        `조회=${result.fetched} 좌표없음제외=${result.skippedNoGeo}`,
    });
    return NextResponse.json({
      ok: true,
      mode: configured ? "live" : "mock",
      ...result,
    });
  } catch (err) {
    const message = ingestErrorMessage(err, "정비사업 적재 실패");
    await logIngest({
      source: "redevelopment",
      dataset: "서울 정비사업 현황",
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
