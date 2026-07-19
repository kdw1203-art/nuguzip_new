/**
 * 거래·전문가 수수료 (크몽 대비 예측 가능·저렴 체계)
 * 공개 페이지: /pricing#fees · /legal/fees
 */

export type FeeRow = {
  id: string;
  label: string;
  kmongPublic?: string;
  nuguzip: string;
  note?: string;
};

/** 구매자 결제·판매자 정산 */
export const MARKETPLACE_FEES: FeeRow[] = [
  {
    id: "buyer_checkout",
    label: "구매자 결제 수수료",
    kmongPublic: "4.5% (VAT 포함)",
    nuguzip: "2.9%",
  },
  {
    id: "report_seller",
    label: "디지털 리포트 판매자 수수료",
    kmongPublic: "카테고리별 상이",
    nuguzip: "10%",
  },
  {
    id: "ebook_seller",
    label: "전자책·자료 판매자 수수료",
    kmongPublic: "카테고리별 상이",
    nuguzip: "8%",
  },
  {
    id: "consult_seller",
    label: "전문가 상담 수수료",
    kmongPublic: "카테고리별 상이",
    nuguzip: "8%",
  },
  {
    id: "verified_expert",
    label: "인증 전문가 우대",
    kmongPublic: "공개 페이지마다 다름",
    nuguzip: "6%",
    note: "리포트·상담·자료 판매 공통 우대율",
  },
  {
    id: "offline_escort",
    label: "오프라인 현장 동행 성사",
    kmongPublic: "별도 협의형",
    nuguzip: "5% + PG 실비",
  },
];

/** 전문가 인증·매칭 */
export const EXPERT_CERT_FEES = [
  { label: "전문가 가입 심사비", rate: "무료" },
  { label: "서류 재심사", rate: "5,000원" },
  { label: "상담 매칭 수수료", rate: "8%" },
  { label: "인증 전문가 매칭 수수료", rate: "6%" },
  { label: "전자책·리포트 판매 수수료", rate: "8%" },
  { label: "모임 참가비 정산 수수료", rate: "3%" },
  { label: "광고형 상단 노출", rate: "월 정액 상품 별도" },
] as const;

/** 경쟁 서비스 포지셔닝 (사업·요금 페이지용) */
export const COMPETITIVE_POSITIONING = [
  {
    service: "직방",
    strength: "AI중개사, 채팅 문의, 지킴진단, 공공분양, 중개사 양면 시장",
    lesson: "소비자용 지도 + 전문가용 리드 관리 대시보드 동시 설계",
  },
  {
    service: "다방",
    strength: "동네정보, 동네이야기, 안전시설, 도형 검색, AI 분석, 우리집 관리",
    lesson: "지도에 주거 판단 자료를 강하게 결합",
  },
  {
    service: "크몽",
    strength: "패키지 비교, 리뷰, 안전 거래, 구매자 수수료 4.5% 공개",
    lesson: "전문가 상담·리포트·자료 패키지화·수수료 명확화",
  },
] as const;
