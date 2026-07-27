import { NextResponse } from "next/server";
import { getWeeklyDigest } from "@/lib/newui/digest";

export const runtime = "nodejs";
// force-dynamic: 빌드(CI) 환경에서는 Service Role 키가 마스킹되어 시장 요약이
// 빈 채로 프리렌더됨 — 런타임 렌더 + CDN s-maxage 캐시로 실데이터 보장
export const dynamic = "force-dynamic";

/** 주간 다이제스트 JSON (#86) — 추후 이메일/푸시 발송용과 동일 데이터 */
export async function GET() {
  /* 전체 조회 실패는 던져서 온다. 빈 다이제스트를 200 으로 내보내면 소비자가
     "이번 주엔 아무 일도 없었다"로 읽는다 — 그건 사실이 아니다. 503 으로 말한다. */
  let digest: Awaited<ReturnType<typeof getWeeklyDigest>>;
  try {
    digest = await getWeeklyDigest();
  } catch (e) {
    return NextResponse.json(
      {
        error: "다이제스트 데이터를 조회하지 못했습니다.",
        cause: e instanceof Error ? e.message : String(e),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(digest, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
