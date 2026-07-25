/**
 * 확정 판매가 단일 소스 — PRO 2,900원 / EXPERT 18,900원.
 * 판매가 확정 (2026-07-20 운영자 결정).
 *
 * 플랜 정의(plans.ts)·기간별 할인표(billing-periods.ts)·IAP 상품(iap-products.ts)·
 * 화면 표시 가격은 전부 이 상수에서 파생된다. 과거에 billing-periods.ts 가
 * 6,900/19,900 을 따로 들고 있어 화면(6,900)과 실제 청구액(2,900·카카오페이는
 * plans.ts 를 읽는다)이 달랐다 — 표시가 청구보다 높은 것도 그 자체로 허위 고지다.
 * 가격을 바꿀 일이 생기면 이 파일 하나만 고친다.
 */
export const BASE_MONTHLY_PRICE_KRW: Record<"pro" | "expert", number> = {
  pro: 2_900,
  expert: 18_900,
};
