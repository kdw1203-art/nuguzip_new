import { NextResponse } from "next/server";
import {
  BILLING_PERIOD_PRICES,
  type BillingPeriodMonths,
} from "@/lib/subscriptions/billing-periods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 토스 광고 "구매 유도하기"(카탈로그 광고)용 상품 피드.
 *
 * 토스 안내문의 필수 조건: 상품 카탈로그(피드) — 상품 ID·상품명·브랜드·이미지·
 * 랜딩 URL·가격 등. 광고 콘솔에 이 URL 을 피드 주소로 등록하면 되고,
 * 가격·구성은 billing-periods.ts 단일 출처에서 읽으므로 판매가가 바뀌면
 * 피드도 자동으로 따라간다 — 광고에 낡은 가격이 나가는 사고를 구조로 막는다.
 *
 * 필드명은 토스 애드센터가 확정 스펙을 주면 거기에 맞춰 매핑을 조정한다.
 * 여기서는 안내문에 명시된 항목을 일반적 커머스 피드 관례(id/title/brand/
 * image_link/link/price)로 담는다 — 스펙에 없는 필드를 지어내지 않는다.
 */

const SITE = "https://nuguzip.com";
const TIER_LABEL: Record<string, string> = { pro: "플러스", expert: "프로" };

type FeedItem = {
  id: string;
  title: string;
  description: string;
  brand: string;
  image_link: string;
  link: string;
  price: number;
  currency: "KRW";
  availability: "in stock";
};

function buildItems(): FeedItem[] {
  const items: FeedItem[] = [];
  for (const tier of ["pro", "expert"] as const) {
    for (const period of BILLING_PERIOD_PRICES[tier]) {
      const months = period.months as BillingPeriodMonths;
      const billing = months === 12 ? "annual" : "monthly";
      const billingLabel = months === 12 ? "연간" : "월간";
      items.push({
        id: `nuguzip-${tier}-${billing}`,
        title: `누구집 ${TIER_LABEL[tier]} ${billingLabel} 구독`,
        description:
          months === 12
            ? `아파트 실거래·시세 분석 ${TIER_LABEL[tier]} 플랜 — 월 ${period.monthlyEquivalentKrw.toLocaleString("ko-KR")}원 꼴(${period.discountPct}% 할인), 결제 7일 이내 전액 환불`
            : `아파트 실거래·시세 분석 ${TIER_LABEL[tier]} 플랜 — 월 ${period.totalKrw.toLocaleString("ko-KR")}원, 결제 7일 이내 전액 환불`,
        brand: "누구집",
        /* 1200×630 기본 공유 카드(라우트 확인: app 레이아웃 og 기본값) —
           광고 소재 심사에서 별도 규격을 요구하면 그때 교체한다. */
        image_link: `${SITE}/og-image`,
        link: `${SITE}/subscription/checkout?tier=${tier}&billing=${billing}`,
        price: period.totalKrw,
        currency: "KRW",
        availability: "in stock",
      });
    }
  }
  return items;
}

export async function GET() {
  return NextResponse.json(
    { updated_at: new Date().toISOString(), items: buildItems() },
    {
      headers: {
        /* 피드는 공개 정보 — 광고 시스템이 주기 수집하므로 1시간 캐시 */
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
