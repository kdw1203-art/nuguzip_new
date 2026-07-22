/**
 * 정비사업장 공공 API 적재 크론 (서울 열린데이터광장).
 * 보호: x-vercel-cron / CRON_SECRET / 관리자 세션 (apt-master-ingest 패턴).
 * SEOUL_OPENAPI_KEY 미설정 시 no-op(mode:"mock", reason:"no-key") — 시드/DB 유지.
 */
import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { ingestSeoulRedevelopment, isRedevIngestConfigured } from "@/lib/redevelopment/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(req: Request) {
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

  const configured = isRedevIngestConfigured();
  const result = await ingestSeoulRedevelopment();
  return NextResponse.json({
    ok: true,
    mode: configured ? "live" : "mock",
    ...result,
  });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
