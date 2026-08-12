/**
 * GET/POST /api/cron/molit-transactions-ingest
 *
 * 국토교통부 아파트 실거래가(RTMS) → `market_transactions` 적재.
 * 시군구 슬라이스를 12시간 창 기준으로 회전하며 전국을 순차 커버한다.
 * 이미 데이터가 있는 (시군구, 계약월) 조합은 건너뛰므로 이중 계상이 없다.
 *
 * 파라미터
 *   ?yyyymm=202606      대상 계약월 (기본: 날짜 홀짝으로 당월/전월 교대 — autoTargetMonth)
 *   ?slice=3            슬라이스 인덱스 수동 지정
 *   ?size=16            1회 처리 시군구 수 (1~60)
 *   ?codes=11680,11710  특정 시군구 코드만 처리
 *
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 * MOLIT 인증키 미설정 시 적재 0건으로 정상 반환(가짜 데이터 생성 없음).
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestMolitTransactions } from "@/lib/market/molit-transactions";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { withBudget, CRON_WORK_BUDGET_MS } from "@/lib/async/with-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  const url = new URL(req.url);
  const authorized = await authorizeCron(req);
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

  const yyyymm = url.searchParams.get("yyyymm") ?? undefined;

  /* F3(#147) — 성공 로그는 ingestMolitTransactions() 안에서 남긴다. 여기서는
     그 함수가 통째로 던졌을 때(키 만료·공공 API 장애·DB 오류)를 받는다.
     이걸 잡지 않으면 실패한 실행이 로그에 아무 흔적도 남기지 않아서,
     어드민 신선도 화면에서 "크론이 아예 안 돌았다"와 구분되지 않는다.

     시간 초과도 같은 문제다 — maxDuration=300 에 걸려 죽으면 catch 도 안 돌아
     아무 기록이 안 남는다. 슬라이스가 크거나 공공 API 가 느린 날 실제로 그랬다.
     270초에 스스로 접는다. 이미 채운 (시군구, 계약월) 조합은 건너뛰므로 중간에
     버려도 이중 계상이 없고, 남은 시군구는 다음 회전에서 다시 잡힌다. */
  const run = await withBudget(
    Promise.resolve().then(() =>
      ingestMolitTransactions({
        yyyymm,
        slice: num("slice"),
        sliceSize: num("size"),
        codes: codes?.length ? codes : undefined,
      }),
    ),
    CRON_WORK_BUDGET_MS,
  );

  /* yyyymm 미지정이면 ingestMolitTransactions 가 당월/전월을 날짜 홀짝으로 고른다.
     성공 로그의 dataset 은 그 함수가 실제 고른 yyyymm 으로 남기므로(logIngest 내부),
     여기 라벨은 오류/타임아웃 경로에서만 쓰인다 — "(자동: 당월/전월)"로 표기. */
  const dataset = `아파트 매매·전월세 실거래 ${yyyymm ?? "(자동: 당월/전월)"}`;

  if (run.state === "timeout") {
    const message = `시간 초과로 중단 (${Math.round(CRON_WORK_BUDGET_MS / 1000)}초) — 다음 실행에서 이어서`;
    await logIngest({
      source: "molit",
      dataset,
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json(
      { ok: false, error: message, timedOut: true, finishedAt: new Date().toISOString() },
      { status: 503 },
    );
  }

  if (run.state === "error") {
    const message = ingestErrorMessage(run.error, "실거래 적재 실패");
    await logIngest({
      source: "molit",
      dataset,
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json(
      { ok: false, error: message, finishedAt: new Date().toISOString() },
      { status: 500 },
    );
  }

  return NextResponse.json({ ...run.value, finishedAt: new Date().toISOString() });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
