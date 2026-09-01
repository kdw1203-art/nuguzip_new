import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getAuctions,
  getActiveAuctionCount,
  AUCTION_USAGE_FILTERS,
  type AuctionItem,
} from "@/lib/onbid/store";
import { logger } from "@/lib/log";

/* /auctions 의 필터 조회용 API (2026-08-10, 사용량 절감 8차)
 *
 * 왜 필요한가: 진행 물건 1,130건 > 페이지 페치 상한 200이라, 다른 목록처럼
 * 전량을 내려보내 클라이언트에서 거르면 필터 결과가 조용히 축소된다(DB 필터는
 * 전체에서 거른다 — 실측). 그래서 필터가 걸리면 이 API 로 DB 필터 결과를
 * 받아온다. 페이지 자체(파라미터 없는 기본 화면 = 봇이 치는 URL)는 ISR 이고,
 * 이 API 는 조합별로 CDN 에 캐시된다(s-maxage=600). usage 6종 × 자치구 목록
 * 유한이라 조합 수가 유계다.
 *
 * 응답은 목록·집계에 필요한 필드만 추려 내려보낸다(원본 row 통짜 금지).
 */

export const dynamic = "force-dynamic"; // 쿼리별 응답 — 캐시는 CDN 헤더가 담당

const CACHE = "public, s-maxage=600, stale-while-revalidate=86400";

/** 화면이 쓰는 필드만 — AuctionItem 의 공개 부분집합 */
export type AuctionApiItem = Pick<
  AuctionItem,
  | "externalKey"
  | "name"
  | "usage"
  | "sido"
  | "sigungu"
  | "emd"
  | "appraisalKrw"
  | "minBidKrw"
  | "bidEnd"
  | "status"
  | "onbidCltrno"
  | "cltrMngNo"
>;

function slim(a: AuctionItem): AuctionApiItem {
  return {
    externalKey: a.externalKey,
    name: a.name,
    usage: a.usage,
    sido: a.sido,
    sigungu: a.sigungu,
    emd: a.emd,
    appraisalKrw: a.appraisalKrw,
    minBidKrw: a.minBidKrw,
    bidEnd: a.bidEnd,
    status: a.status,
    onbidCltrno: a.onbidCltrno,
    cltrMngNo: a.cltrMngNo,
  };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const usageRaw = (sp.get("usage") ?? "").trim();
  const guRaw = (sp.get("gu") ?? "").trim();

  // usage 는 정의된 키만. gu 는 자치구명 형태만(캐시 조합 폭주·이상 입력 차단).
  const usage = AUCTION_USAGE_FILTERS.some((f) => f.key === usageRaw)
    ? usageRaw
    : undefined;
  const gu = /^[가-힣]{1,10}( [가-힣]{1,10})?$/.test(guRaw) ? guRaw : undefined; // [941] 공백 1칸 허용

  try {
    const [items, activeTotal] = await Promise.all([
      getAuctions({ usage, sigungu: gu, limit: 200 }),
      getActiveAuctionCount(),
    ]);
    return NextResponse.json(
      { ok: true as const, items: items.map(slim), activeTotal },
      { headers: { "Cache-Control": CACHE } },
    );
  } catch (e) {
    logger.error("[api/auctions] 공매 목록 조회 실패", e);
    /* 실패는 실패로 — 200+빈 배열로 답하면 "이 조건 물건 0건"으로 둔갑한다.
       실패 응답은 캐시하지 않는다(부분 실패를 캐시에 눌러앉히지 않는다). */
    return NextResponse.json(
      { ok: false as const, error: "조회 실패" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
