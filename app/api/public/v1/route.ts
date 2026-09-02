import type { NextRequest } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { publicApiJson, publicApiOptions } from "@/lib/api/public-response";
import { DEFAULT_LIMIT, MAX_LIMIT } from "@/lib/api/public-aggregates";

/* N20 — 공개 집계 API 의 목차. 사람이 /developers 를 읽지 않고 API 부터 부를 때
   여기서 나머지 엔드포인트를 찾을 수 있어야 한다(자기 기술 문서). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return publicApiOptions();
}

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, { max: 120, windowMs: 60_000 });
  if (limited) return limited;

  return publicApiJson({
    service: "내집나우 공개 집계 API",
    version: "v1",
    docs: "https://nuguzip.com/developers",
    scope:
      "국토교통부 실거래 신고 자료로 만든 아파트 매매 월간 지역 집계. 개별 실거래 행·전월세·사용자 데이터는 포함하지 않습니다.",
    updateCadence: "하루 2회 (KST 09:00 · 18:00 전후) 수집 후 집계 갱신",
    endpoints: [
      {
        path: "/api/public/v1/months",
        method: "GET",
        description: "집계가 존재하는 월 목록과 월별 총 거래 건수",
      },
      {
        path: "/api/public/v1/regions/monthly",
        method: "GET",
        description: "지역×월 집계 (거래 건수 · 평균 거래가 · 평당가 · 전월 대비 변동률)",
        params: {
          month: "yyyymm — 생략하면 전체 월",
          region: "지역명 부분 일치 (예: 강남)",
          limit: `1~${MAX_LIMIT} (기본 ${DEFAULT_LIMIT})`,
          offset: "0 이상",
        },
      },
    ],
    limits: {
      rateLimit: "IP 당 분당 120회",
      maxRowsPerRequest: MAX_LIMIT,
    },
    notes: [
      "실거래 신고는 계약 후 30일 이내이므로 이번 달·직전 달 수치는 이후 늘어납니다. 응답의 provisional 필드로 표시합니다.",
      "조회 실패는 빈 배열이 아니라 503 으로 응답합니다 — '데이터 없음'과 '조회 실패'는 다른 사실입니다.",
    ],
  });
}
