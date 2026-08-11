import { NextRequest, NextResponse } from "next/server";
import { searchPublicRecords } from "@/lib/market/public-records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /data/records 의 단지 검색 API (사용량 절감 14차).
 *
 * 페이지는 ISR(통계만)이고 ?complex= 검색은 자유 텍스트 DB 검색이라 클라이언트
 * 메모리 필터로 못 바꾼다 — 검색만 이 API 로 분리해 검색어별로 CDN 에 캐시한다
 * (s-maxage 600). 원천(public_property_records)은 CODEF 배치 적재라 10분이면
 * 충분히 신선하다. 실측(2026-08-11): 아직 0행(자격 증명 대기) — 그동안 모든
 * 검색은 정직한 빈 결과다.
 *
 * 실패는 503 + no-store — "자료 없음"(200 + []) 과 다른 사실이고 캐시에
 * 눌러앉으면 안 된다.
 */
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("complex") ?? "").trim();
  if (!raw || raw.length > 40) {
    return NextResponse.json(
      { ok: false, error: "invalid_query" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { ok, items } = await searchPublicRecords(raw, 60);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "search_failed" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }
  return NextResponse.json(
    { ok: true, items },
    {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400",
      },
    },
  );
}
