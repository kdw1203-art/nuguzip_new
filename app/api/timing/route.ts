import { NextRequest, NextResponse } from "next/server";
import {
  computeRegionTemperature,
  findTemperatureRegion,
} from "@/lib/market/temperature";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /analysis/timing 의 지역 전환 API (사용량 절감 13차 — auctions /api/auctions 선례).
 *
 * 페이지는 ISR 로 기본 지역만 품고, 지역을 바꾸면 이 API 를 부른다. 응답은
 * 지역별로 CDN 에 캐시된다(s-maxage 1800) — 62개 지역 각각이 최대 30분에 한 번만
 * 실계산되고, 그 사이 같은 지역 조회는 함수 실행 없이 CDN 에서 나간다.
 * 지수(월/주 단위)·월별 거래량이 원천이라 30분이면 충분히 신선하다.
 *
 * 실패 처리: computeRegionTemperature 의 하위 로더(loadTrend 등)는 실패를
 * null/[] 로 삼키는 기존 설계라 여기서 "조회 실패"와 "데이터 없음"을 완전히
 * 가르지는 못한다(스냅샷 크론과 공유하는 계산이라 여기서 의미론을 바꾸지
 * 않는다 — 가르지 못한다는 사실을 가리지 않고 적어 둔다). 이 핸들러 자체가
 * 던지면 503 + no-store 로 캐시에 눌러앉지 않게 한다.
 */
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("region") ?? "").trim();
  const region = findTemperatureRegion(raw);
  if (!region) {
    return NextResponse.json(
      { ok: false, error: "unknown_region" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const { trend, volume, temp } = await computeRegionTemperature(region);
    return NextResponse.json(
      { ok: true, region: region.id, trend, volume, temp },
      {
        headers: {
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
        },
      },
    );
  } catch (e) {
    logger.error("[api/timing] 계산 실패", e);
    return NextResponse.json(
      { ok: false, error: "compute_failed" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    );
  }
}
