/**
 * 가격 표기 포맷터 (순수 함수 — 데이터 소스 없음).
 *
 * 사실 우선: 원래 이 두 함수는 `lib/listings/filter.ts` 안에 있었고, 그 파일은
 * `lib/listings/sample-data.ts`(허구 매물 생성기)를 import 하고 있었다.
 * 실제로 프로덕션에 닿는 건 이 포맷터 두 개뿐이라 여기로 분리하고
 * 생성기·필터 모듈은 삭제했다. 자세한 사유는 커밋 메시지 참고.
 */

/** 가격(원)을 억/만 라벨로 — 예: 12.5억, 8,500만 */
export function formatPriceKrw(won: number): string {
  if (!Number.isFinite(won) || won <= 0) return "—";
  if (won >= 100_000_000) {
    const eok = won / 100_000_000;
    return `${eok >= 10 ? Math.round(eok).toLocaleString("ko-KR") : eok.toFixed(1)}억`;
  }
  return `${Math.round(won / 10_000).toLocaleString("ko-KR")}만`;
}

/** 월세 표기 — 보증금/월 (예: 5,000만/85만) */
export function formatRentLabel(deposit: number, monthly: number): string {
  return `${formatPriceKrw(deposit)}/${formatPriceKrw(monthly)}`;
}
