/**
 * [#96] 생활 인프라(학교·도시철도역) 표준데이터 인제스트 크론.
 * 보호: CRON_SECRET · 관리자 세션 (lib/cron/authorize.ts)
 * 선행: DATA_GO_KR_SERVICE_KEY + POI_SCHOOLS_API_PATH / POI_STATIONS_API_PATH
 *      (오너 패킷 ⑧ — 표준데이터 오픈API 상세의 요청 주소 경로 2개)
 * 스케줄: .github/workflows/etl.yml — 매월 1일 + 수동(workflow_dispatch).
 *         학교·역 위치는 월 단위 갱신이면 충분하다.
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestPoi } from "@/lib/poi/store";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const out: Record<string, unknown> = {};
  let anyError: string | null = null;
  for (const kind of ["schools", "stations"] as const) {
    try {
      const r = await ingestPoi(kind);
      out[kind] = r;
      await logIngest({
        source: "poi",
        dataset: kind === "schools" ? "학교위치 표준데이터" : "도시철도역사 표준데이터",
        origin: "cron-fetch",
        rows: r.upserted,
        status: r.configured ? "ok" : "skipped",
        message: r.configured
          ? `조회=${r.fetched} 업서트=${r.upserted} 페이지=${r.pages}`
          : (r.reason ?? "미구성"),
      });
    } catch (err) {
      const message = ingestErrorMessage(err, `${kind} 인제스트 실패`);
      anyError = message;
      out[kind] = { error: message };
      await logIngest({
        source: "poi",
        dataset: kind === "schools" ? "학교위치 표준데이터" : "도시철도역사 표준데이터",
        origin: "cron-fetch",
        rows: 0,
        status: "error",
        message,
      });
    }
  }
  return NextResponse.json({ ok: !anyError, ...out }, { status: anyError ? 500 : 200 });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
