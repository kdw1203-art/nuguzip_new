import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * [953] 폐기 — 같은 일을 하는 라우트가 둘이었다.
 *
 *  · /api/market-requests/[id]/propose   인증 전문가만 · 시간당 10회 · 사기 스캔 · UI 가 쓰는 쪽
 *  · /api/market/requests/[id]/proposals 로그인만 있으면 누구나 · 상한 없음 · 이 파일
 *
 * 두 번째는 어떤 UI 도 부르지 않았고, 인증 게이트 없이 market_request_proposals 에
 * 행을 넣을 수 있는 구멍이었다. 410 으로 닫고 정본 주소를 알려 준다.
 * (파일을 지우지 않고 남기는 이유: 옛 클라이언트가 404 를 "일시 오류"로 오해하고
 * 재시도하지 않게, 명시적으로 "사라졌다"고 답한다.)
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "이 주소는 더 이상 쓰지 않아요. /api/market-requests/{id}/propose 를 사용해 주세요.",
      replacement: "/api/market-requests/{id}/propose",
    },
    { status: 410 },
  );
}
