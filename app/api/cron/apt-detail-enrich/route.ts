import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { isDataGoKrEncodingConfigured } from "@/lib/public-data/data-go-kr-keys";
import { enrichAptDetailBatch } from "@/lib/national-data/apartment-ingest";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { withBudget, CRON_WORK_BUDGET_MS } from "@/lib/async/with-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 공동주택 단지 상세(기본정보) 백필 크론 — D7 잔여 과제.
 *
 * apt-master-ingest 가 채우는 단지 목록에는 좌표·주차·건설사가 없다. 이 크론이
 * 매 실행 metadata.detailFetchedAt 없는 단지를 limit 건(기본 50, 최대 200) 골라
 * AptBasisInfoService2 상세를 받아 metadata 에 병합한다(좌표 포함). 커서 테이블
 * 없이 스탬프 자체가 커서다 — 상세 로직은 lib/national-data/apartment-ingest.ts
 * 의 enrichAptDetailBatch 주석 참조.
 *
 * 보호: x-vercel-cron / CRON_SECRET / 관리자 세션 (apt-master-ingest 패턴).
 * 인증키 미설정 시 상세 API 가 mock/empty 를 반환하므로 시도 자체를 건너뛰고
 * skipped 로 기록한다(스탬프 없음 — 키가 생기면 같은 행부터 다시 시작).
 */
async function handle(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorized =
    fromVercelCron ||
    (expected ? provided === expected : true) ||
    (await isAdminApiRequest());
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  if (!isDataGoKrEncodingConfigured()) {
    await logIngest({
      source: "apt-detail",
      dataset: "공동주택 단지 상세 백필",
      origin: "cron-fetch",
      rows: 0,
      status: "skipped",
      message: "data.go.kr 인증키 미설정",
    });
    return NextResponse.json({
      ok: true,
      processed: 0,
      enriched: 0,
      failed: 0,
      skipped: "no-key",
    });
  }

  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  /* limit 건(기본 50, 최대 200)을 상세 API 로 하나씩 받는 배치라, 공공 API 가
     느린 날에는 maxDuration=300 을 넘긴다. 그렇게 죽으면 아래 logIngest 가 아예
     실행되지 않아 "돌다가 잘렸다"는 사실이 어디에도 안 남는다. 270초에 접고
     기록을 남긴다 — 스탬프(metadata.detailFetchedAt) 자체가 커서라서 이미 병합된
     단지는 다음 실행에서 다시 뽑히지 않고, 못 한 단지만 그대로 남는다. */
  const run = await withBudget(
    Promise.resolve().then(() => enrichAptDetailBatch(limit)),
    CRON_WORK_BUDGET_MS,
  );

  if (run.state === "timeout") {
    const message = `시간 초과로 중단 (${Math.round(CRON_WORK_BUDGET_MS / 1000)}초) — 다음 실행에서 이어서`;
    await logIngest({
      source: "apt-detail",
      dataset: "공동주택 단지 상세 백필",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message, timedOut: true }, { status: 503 });
  }

  if (run.state === "error") {
    const message = ingestErrorMessage(run.error, "단지 상세 백필 실패");
    await logIngest({
      source: "apt-detail",
      dataset: "공동주택 단지 상세 백필",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  const { processed, enriched, failed, skipped, errors } = run.value;

  /* 여기서부터는 집계가 끝났고 남은 일은 기록뿐이다. 기록(logIngest)이 실패해도
     보강 자체는 이미 성공했으므로 응답까지 500 으로 바꾸지 않는다. */
  try {
    const status = failed > 0 ? "error" : enriched > 0 ? "ok" : "skipped";
    await logIngest({
      source: "apt-detail",
      dataset: "공동주택 단지 상세 백필",
      origin: "cron-fetch",
      rows: enriched,
      status,
      message:
        skipped === "no-rows"
          ? "미보강 단지 없음 — 백필 완료"
          : `처리=${processed} 병합=${enriched} 실패=${failed}${
              errors.length > 0 ? ` · ${errors.map((e) => ingestErrorMessage(e)).join(" / ")}` : ""
            }`,
    });

    return NextResponse.json({
      ok: failed === 0,
      processed,
      enriched,
      failed,
      ...(skipped ? { skipped } : {}),
      ...(errors.length > 0 ? { errors: errors.map((e) => ingestErrorMessage(e)) } : {}),
    });
  } catch (err) {
    /* 기록만 실패한 경우. 보강 결과는 사실대로 돌려주되, 기록이 빠졌다는 것도
       숨기지 않는다(어드민 신선도 화면에서 이 회차가 비어 보일 이유가 된다). */
    return NextResponse.json({
      ok: failed === 0,
      processed,
      enriched,
      failed,
      ...(skipped ? { skipped } : {}),
      logged: false,
      logError: ingestErrorMessage(err, "수집 로그 기록 실패"),
      ...(errors.length > 0 ? { errors: errors.map((e) => ingestErrorMessage(e)) } : {}),
    });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
