import "server-only";

import { NextResponse } from "next/server";
import { PUBLIC_API_LICENSE } from "@/lib/api/public-aggregates";

/**
 * N20 — 공개 JSON API 의 응답 규약.
 *
 * 세 가지를 모든 응답에 강제한다.
 *
 * 1) **출처가 응답 안에 들어간다.** 이용 조건이 문서 페이지에만 있으면 API 만
 *    긁어 간 쪽은 영영 보지 못한다. license 블록을 본문에 실으면 인용 문구가
 *    데이터와 같이 이동한다.
 * 2) **실패는 절대 200 이 아니다.** 조회 실패를 빈 배열로 돌려주면 받아 간
 *    쪽이 "그 달에 거래가 없었다"고 인용한다 — 사람이 걸러 주지 않는 경로라
 *    화면보다 위험하다. 읽기 실패는 503(다시 오라), 잘못된 요청은 400 이다.
 * 3) **CORS 는 전면 개방한다.** 공개 데이터이고 브라우저에서 바로 쓰라고 여는
 *    API 다. 인증이 없으므로 Origin 을 제한해 얻을 보안 이득이 없다.
 */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** 집계는 하루 두 번 갱신된다 — CDN 1시간이면 원본을 때릴 이유가 없다. */
const CACHE_CONTROL = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

export function publicApiJson(
  body: Record<string, unknown>,
  init?: { status?: number; cache?: boolean },
): NextResponse {
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    /* 기계 판독 엔드포인트다 — 검색 결과에 JSON 이 뜰 이유가 없다. */
    "X-Robots-Tag": "noindex",
  };
  if (init?.cache !== false) headers["Cache-Control"] = CACHE_CONTROL;
  else headers["Cache-Control"] = "no-store";

  return NextResponse.json(
    { ...body, license: PUBLIC_API_LICENSE },
    { status: init?.status ?? 200, headers },
  );
}

/** 400 — 요청이 잘못됐다. 무엇이 왜 틀렸는지 적는다(에러도 문서다). */
export function publicApiBadRequest(message: string, hint?: string): NextResponse {
  return publicApiJson({ error: { code: "bad_request", message, hint } }, { status: 400, cache: false });
}

/**
 * 503 — 우리가 못 읽었다. "데이터가 없다"가 아니다.
 *
 * 404 를 쓰지 않는 이유: 404 는 "영구히 없다"는 뜻이라 재시도할 이유를 없앤다.
 * 조회 실패는 다음에 다시 오면 성공할 수 있는 상태다.
 */
export function publicApiUnavailable(detail: string): NextResponse {
  return publicApiJson(
    {
      error: {
        code: "upstream_unavailable",
        message:
          "집계를 조회하지 못했습니다. 데이터가 없다는 뜻이 아니라 조회 자체가 실패했다는 뜻입니다.",
        detail,
      },
    },
    { status: 503, cache: false },
  );
}

/** 프리플라이트 — 모든 공개 API 라우트가 그대로 재사용한다. */
export function publicApiOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
