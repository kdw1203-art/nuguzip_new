/**
 * GET /api/applyhome/competition
 * 청약홈 APT 분양정보/경쟁률 (odcloud ApplyhomeInfoCmpetRtSvc)
 */
import { NextResponse } from "next/server";
import { logger } from "@/lib/log";
import { fetchAptCompetition } from "@/lib/applyhome/adapters/apt-competition";
import type { ApplyhomeCompetitionEndpoint } from "@/lib/applyhome/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINTS: ApplyhomeCompetitionEndpoint[] = [
  "getAPTLttotPblancCmpet",
  "getUrbtyOfctlLttotPblancCmpet",
  "getAptLttotPblancScore",
  "getOPTLttotPblancCmpet",
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const endpointParam = searchParams.get("endpoint") ?? "getAPTLttotPblancCmpet";
  const endpoint = ENDPOINTS.includes(endpointParam as ApplyhomeCompetitionEndpoint)
    ? (endpointParam as ApplyhomeCompetitionEndpoint)
    : "getAPTLttotPblancCmpet";

  try {
    const data = await fetchAptCompetition({
      endpoint,
      page: Number(searchParams.get("page") ?? "1") || 1,
      perPage: Math.min(Number(searchParams.get("perPage") ?? "20") || 20, 50),
      houseManageNo: searchParams.get("houseManageNo") ?? undefined,
      pblancNo: searchParams.get("pblancNo") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    /* 업스트림 원문 에러는 서버 로그로만 — 익명 응답에는 일반 문구. */
    logger.warn("[api/applyhome/competition] 조회 실패", err);
    return NextResponse.json(
      { error: "경쟁률 조회가 잠시 실패했습니다. 잠시 후 다시 시도해 주세요.", mode: "error" },
      { status: 502 },
    );
  }
}
