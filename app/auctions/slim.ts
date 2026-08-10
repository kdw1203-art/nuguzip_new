import type { AuctionItem } from "@/lib/onbid/store";
import type { AuctionApiItem } from "@/app/api/auctions/route";

/** 화면이 쓰는 필드만 추려 클라이언트 payload 를 줄인다 — API(slim)와 같은 모양.
 *  서버 전용 모듈(store)을 클라이언트가 import 하지 않도록 여기서 변환한다. */
export function slimAuctionItems(items: AuctionItem[]): AuctionApiItem[] {
  return items.map((a) => ({
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
  }));
}
