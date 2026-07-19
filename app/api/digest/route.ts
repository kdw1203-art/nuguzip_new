import { NextResponse } from "next/server";
import { getWeeklyDigest } from "@/lib/newui/digest";

export const runtime = "nodejs";
// force-dynamic: 빌드(CI) 환경에서는 Service Role 키가 마스킹되어 시장 요약이
// 빈 채로 프리렌더됨 — 런타임 렌더 + CDN s-maxage 캐시로 실데이터 보장
export const dynamic = "force-dynamic";

/** 주간 다이제스트 JSON (#86) — 추후 이메일/푸시 발송용과 동일 데이터 */
export async function GET() {
  const digest = await getWeeklyDigest();
  return NextResponse.json(digest, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
