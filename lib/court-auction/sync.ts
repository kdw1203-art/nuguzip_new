import "server-only";
import { logger } from "@/lib/log";

/**
 * 법원경매(court auction) 동기화 — 데이터 소스 플러그인 스캐폴드.
 *
 * 무료로 안정적인 공식 법원경매 API 가 없으므로, 실제 소스는 env
 * `COURT_AUCTION_SOURCE_KEY` 로 게이트한다(온비드 isOnbidConfigured 패턴과 동일한
 * fail-soft). 키가 없으면 skipped 로 정상 반환하고, 키가 있어도 아직 실제 fetch 는
 * 구현하지 않았으므로 명시적 TODO 스텁으로 skipped 를 반환한다. 절대 throw 하지 않는다.
 *
 * 실제 소스가 정해지면 아래 TODO 지점에서 fetch → 매핑 → court_auctions upsert
 * (external_key onConflict) 를 구현한다. 쓰기는 getServiceSupabase() 로 한다.
 */

export type CourtAuctionSyncResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  inserted?: number;
};

/** 실 데이터 소스 키 설정 여부 (온비드 isOnbidConfigured 미러) */
export function isCourtAuctionConfigured(): boolean {
  return Boolean(process.env.COURT_AUCTION_SOURCE_KEY?.trim());
}

export async function syncCourtAuctions(): Promise<CourtAuctionSyncResult> {
  try {
    if (!isCourtAuctionConfigured()) {
      // 키 미설정 — 예시 행(is_sample=true)만 유지. 정상 폴백.
      return { ok: true, skipped: true, reason: "no-source-key" };
    }

    // TODO(court-auction): 실 데이터 소스 연결 지점.
    //   1) COURT_AUCTION_SOURCE_KEY 로 원본 목록 fetch (AbortSignal.timeout).
    //   2) CourtAuctionItem 스키마(snake_case 컬럼)로 매핑 — external_key 필수.
    //   3) getServiceSupabase() 로 court_auctions.upsert(rows, { onConflict: "external_key" }).
    //   구현 전까지는 실제 API 를 임의로 만들지 않고 스텁으로 skipped 반환.
    return { ok: true, skipped: true, reason: "source-not-implemented" };
  } catch (e) {
    // 방어적: 어떤 경우에도 throw 하지 않는다(크론 하드 실패 방지).
    logger.error("[court-auction sync] error", e);
    return { ok: true, skipped: true, reason: "error" };
  }
}
