import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { isDataGoKrEncodingConfigured } from "@/lib/public-data/data-go-kr-keys";
import {
  listAllSigunguCodes,
  ingestAptMasterBatch,
} from "@/lib/national-data/apartment-ingest";
import { logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 전국 공동주택 단지 마스터 적재 크론.
 *
 * 커서 테이블 없이 STATELESS 하게 전국을 순회한다. 매 실행마다 현재 시각으로
 * 시군구 슬라이스(12개)를 선택하므로, 여러 번의 실행에 걸쳐 전국을 커버한다.
 *
 * 보호: x-vercel-cron / CRON_SECRET / 관리자 세션 (onbid-sync 패턴).
 * 인증키 미설정 시 하위 API가 mock/empty 를 반환 → upserted:0, reason:"no-key".
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

  const codes = listAllSigunguCodes().map((c) => c.sigunguCd);
  const total = codes.length;

  // STATELESS 순환: 12시간 창(window)마다 다음 슬라이스로 이동.
  const SLICE = 12;
  const idx =
    Math.floor(Date.now() / (1000 * 60 * 60 * 12)) % Math.ceil(total / SLICE);
  const batch = codes.slice(idx * SLICE, idx * SLICE + SLICE);

  const configured = isDataGoKrEncodingConfigured();
  const { sigungu, upserted, failed, errors } = await ingestAptMasterBatch(batch);
  const mode: "live" | "mock" = configured ? "live" : "mock";

  /* F3/#147 — 적재 로그(신선도 대시보드·운영 추적용).
     이전 버전은 status 가 skipped/ok 둘 중 하나밖에 될 수 없었다. 적재 함수가
     모든 오류를 삼키고 카운트만 돌려줬기 때문이다. 그래서 #150 이전의 "없는
     테이블에 쓰기" 실패가 로그상으로는 매번 '키 없음으로 건너뜀' 과 구별되지
     않았다. 이제 failed 를 올려 받아 error 를 낼 수 있다. */
  const status = failed > 0 ? "error" : !configured ? "skipped" : upserted > 0 ? "ok" : "skipped";
  const slice = `slice=${idx}/${Math.ceil(total / SLICE)} 시군구=${sigungu}`;
  await logIngest({
    source: "apt-master",
    dataset: "전국 공동주택 단지 마스터",
    origin: "cron-fetch",
    rows: upserted,
    status,
    message: !configured
      ? "data.go.kr 인증키 미설정"
      : failed > 0
        ? `${slice} 실패=${failed}행${errors.length > 0 ? ` · ${errors.join(" / ")}` : ""}`
        : slice,
  });

  return NextResponse.json({
    ok: failed === 0,
    slice: idx,
    sigungu,
    upserted,
    mode,
    total,
    batch,
    ...(failed > 0 ? { failed, errors } : {}),
    ...(upserted === 0 && !configured ? { reason: "no-key" } : {}),
  });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
