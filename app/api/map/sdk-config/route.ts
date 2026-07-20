import { NextResponse } from "next/server";
import { resolveNaverMapClientId } from "@/lib/map/naver-maps-sdk";

export const runtime = "nodejs";
// 런타임 강제: CI 빌드 환경에서는 NEXT_PUBLIC_* 가 "[SENSITIVE]" 로 마스킹되어
// 번들에 폴백 상수가 박힌다. 런타임(Vercel 함수)에서는 실값이 주입되므로
// 브라우저가 이 엔드포인트로 실제 ncpKeyId 를 받아 SDK 를 로드한다.
// ncpKeyId 는 브라우저 maps.js 요청 URL 에 그대로 노출되는 공개 값이며
// NCP 콘솔의 Web 서비스 URL(도메인) 등록으로 보호된다.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ncpKeyId: resolveNaverMapClientId() },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } },
  );
}
