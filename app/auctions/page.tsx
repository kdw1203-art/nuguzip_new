import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { PageShell } from "@/app/components/PageShell";
import { AdZone } from "@/app/components/ads/AdZone";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownPageHead } from "@/app/town/TownPageHead";
import { getAuctions, getActiveAuctionCount } from "@/lib/onbid/store";
import { seoAlternates } from "@/lib/seo/alternates";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { logger } from "@/lib/log";
import { AuctionsClient } from "./AuctionsClient";
import { slimAuctionItems } from "./slim";
import { ComplianceNotice } from "@/app/components/ComplianceNotice";

/* 비용 실측(2026-08-10, 사용량 절감 8차): 서버가 ?usage/gu/source 를 읽어
   요청마다 렌더 — 크롤 1회 = 함수 호출 1회였다. 다른 목록과 달리 전량
   클라이언트 필터로 못 바꾼다: 진행 물건 1,130건 > 페치 상한 200이라 필터
   결과가 조용히 축소된다(실측). 구조를 셋으로 갈랐다 —
   · 이 페이지(파라미터 없음): ISR 10분, 기본 목록 200건이 SSR HTML 에 전부.
   · 필터: /api/auctions (조합별 CDN 캐시 s-maxage=600) 를 클라이언트가 fetch.
   · source=court: AuctionsClient 안의 클라이언트 분기.
   D-day·진행/마감·캘린더는 클라이언트가 조회 시각으로 계산 — 요청 시각 기준
   이던 예전보다 오히려 신선하다(SSR 은 builtAtMs 로 하이드레이션 일치). */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "수도권 공매 물건 (온비드) | 내집나우",
  description:
    "한국자산관리공사 온비드 공매 부동산 — 서울·경기·인천 아파트·오피스텔·빌라 감정가·최저입찰가·입찰일정. 공공 데이터 기반.",
  robots: { index: true, follow: true },
  // N7 — 필터·정렬 파라미터 조합이 별개 URL 로 색인되지 않도록 canonical 고정
  alternates: seoAlternates("/auctions"),
};

/** 테마 구분: 공매·경매 = 보라 (딜·긴급). subtree 안에서 text-primary·bg-primary-soft·
 *  chip-active·btn-primary 가 보라로 재테마됨 (예시 배지 앰버는 그대로 대비 유지). */
const AUCTION_THEME = {
  "--primary": "#7c3aed",
  "--primary-soft": "#f1ebfe",
  "--primary-strong": "#6528d6",
} as CSSProperties;

export default async function AuctionsPage() {
  /* 2026-07-26: store 가 실패 때 `[]`·`0` 을 돌려주던 걸 던지도록 고쳤다.
     여기서 받아서 "지금 불러오지 못했다"고 말한다 — 물건이 0건인 것과 조회가
     죽은 것을 같은 화면으로 그리면 안 된다. ISR 에서 던지면 이전 정상 캐시가
     유지되고(stale), 캐시가 아예 없으면 이 에러 분기가 나간다. */
  const loaded = await Promise.all([
    getAuctions({ limit: 200 }),
    getActiveAuctionCount(),
  ]).then(
    ([items, activeTotal]) => ({ ok: true as const, items, activeTotal }),
    (err: unknown) => {
      logger.error("[auctions] 온비드 공매 조회 실패", err);
      return { ok: false as const };
    },
  );

  if (!loaded.ok) {
    return (
      <PageShell breadcrumb="동네이야기 › 공매 물건" wide>
        <TownCategoryNav stick />
        <TownPageHead href="/auctions" title="공매 물건" sub="온비드 진행·예정 물건 — 감정가·최저입찰가·입찰일" />
        <div style={AUCTION_THEME}>
          <ErrorState
            title="공매 물건을 지금 불러오지 못했어요"
            desc="진행 중인 물건이 0건인 게 아니라 조회 자체가 실패했습니다. 잠시 후 새로고침해 주세요. 급하시면 온비드에서 직접 확인하실 수 있어요."
            action={{ href: "https://www.onbid.co.kr", label: "온비드 바로가기" }}
          />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell breadcrumb="동네이야기 › 공매 물건" wide>
      <TownCategoryNav stick />
      <TownPageHead href="/auctions" title="공매 물건" sub="온비드 진행·예정 물건 — 감정가·최저입찰가·입찰일" />
      <div style={AUCTION_THEME}>
        <AuctionsClient
          initialItems={slimAuctionItems(loaded.items)}
          initialActiveTotal={loaded.activeTotal}
          builtAtMs={Date.now()}
          adSlot={<AdZone placement="community_feed" seed={0} plan={null} />}
        />
        {/* 수익 문구 미기재 방침(소유자 방침 2026-08-11) — 마켓(공매) 표면 고지 */}
        <ComplianceNotice variant="market" className="mt-6" />
      </div>
    </PageShell>
  );
}
