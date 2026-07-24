/**
 * GET/POST /api/cron/molit-transactions-ingest
 *
 * 국토교통부 아파트 실거래가(RTMS) → `market_transactions` 적재.
 * 시군구 슬라이스를 12시간 창 기준으로 회전하며 전국을 순차 커버한다.
 * 이미 데이터가 있는 (시군구, 계약월) 조합은 건너뛰므로 이중 계상이 없다.
 *
 * 파라미터
 *   ?yyyymm=202606      대상 계약월 (기본: 전달)
 *   ?slice=3            슬라이스 인덱스 수동 지정
 *   ?size=16            1회 처리 시군구 수 (1~60)
 *   ?codes=11680,11710  특정 시군구 코드만 처리
 *
 * 보호: x-vercel-cron / CRON_SECRET / 관리자 세션.
 * MOLIT 인증키 미설정 시 적재 0건으로 정상 반환(가짜 데이터 생성 없음).
 */
import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { ingestMolitTransactions } from "@/lib/market/molit-transactions";

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

  const num = (key: string): number | undefined => {
    const raw = url.searchParams.get(key);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const codes = url.searchParams
    .get("codes")
    ?.split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const result = await ingestMolitTransactions({
    yyyymm: url.searchParams.get("yyyymm") ?? undefined,
    slice: num("slice"),
    sliceSize: num("size"),
    codes: codes?.length ? codes : undefined,
  });

  return NextResponse.json({ ...result, finishedAt: new Date().toISOString() });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
