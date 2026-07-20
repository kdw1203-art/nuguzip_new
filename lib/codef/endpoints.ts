/**
 * CODEF(codef.io) 부동산 데이터 상품 카탈로그.
 *
 * 사용자가 제공한 12개 CODEF API 명세(.xlsx, 2026-07-17 기준)를 코드로 옮긴 것.
 * 이 파일 자체에는 데이터가 없다 — 명세(입력·출력 필드·기관코드·인증방식)를 정의하고,
 * lib/codef/client.ts 가 실제 호출에, /data/records 가 출처 안내에 사용한다.
 *
 * 인증 등급:
 *  - "public"   : 기관코드만으로 조회 가능(시세·실거래·단지목록 등) → 시장 데이터 대량 수집 가능
 *  - "secure"   : 보안문자(2way) 필요 — 자동 인식 지원되나 실패 가능
 *  - "cert"     : 공동인증서 필요 — 원칙적으로 "본인 소유 물건"만 조회(신고이력 등) → 대량 수집 부적합
 */

export type CodefAuthLevel = "public" | "secure" | "cert";

export type CodefProduct = {
  key: string;
  /** 화면 표기용 데이터셋 이름 (public_property_records.dataset 값과 일치) */
  dataset: string;
  label: string;
  /** CODEF 기관코드 (organization) */
  organization: string;
  /** CODEF API 상대경로 (v1) — 실제 호출 시 base + path */
  path: string;
  authLevel: CodefAuthLevel;
  /** 시장 데이터 대량 수집에 적합한지 (본인인증 필요 상품은 false) */
  bulk: boolean;
  /** 화면 설명 */
  description: string;
  sourceFile: string;
};

/** CODEF 상품 목록 — 사용자 제공 명세 기준 */
export const CODEF_PRODUCTS: CodefProduct[] = [
  {
    key: "price_quote",
    dataset: "kb_price_quote",
    label: "KB 시세정보",
    organization: "0011",
    path: "/v1/kr/real-estate/kb/quotation/price-info",
    authLevel: "secure",
    bulk: true,
    description:
      "단지·면적·호별 매매/전세 상·하한 평균가(만원), 세대수·승인월·협력 공인중개사 정보. 시세 기준일 제공.",
    sourceFile: "시세정보 조회_20260717.xlsx",
  },
  {
    key: "complex_list",
    dataset: "complex_list",
    label: "단지목록 조회",
    organization: "0011",
    path: "/v1/kr/real-estate/kb/quotation/complex-list",
    authLevel: "public",
    bulk: true,
    description: "시/도·구/군·동 단위 단지 목록과 단지 식별자.",
    sourceFile: "단지목록 조회_20260717.xlsx",
  },
  {
    key: "complex_serial",
    dataset: "complex_serial",
    label: "단지 일련번호 조회",
    organization: "0011",
    path: "/v1/kr/real-estate/kb/quotation/complex-serial",
    authLevel: "public",
    bulk: true,
    description: "단지명 → KB 단지 일련번호 매핑 (시세 조회 키).",
    sourceFile: "단지 일련번호 조회_20260717.xlsx",
  },
  {
    key: "complex_basic",
    dataset: "complex_basic",
    label: "단지 기본정보(K-apt)",
    organization: "kapt",
    path: "/v1/kr/public/lt/molit-apt/basis-info",
    authLevel: "public",
    bulk: true,
    description: "공동주택관리정보시스템(K-apt) 단지 기본정보 — 주 1회 갱신.",
    sourceFile: "20260717_단지_기본정보.xlsx",
  },
  {
    key: "real_deal_apt",
    dataset: "real_deal",
    label: "실거래가(아파트·연립·오피스텔)",
    organization: "0010",
    path: "/v1/kr/real-estate/general/real-transaction-price/building",
    authLevel: "public",
    bulk: true,
    description: "국토부 실거래 매매·전월세 — 계약일·전용면적·거래금액(만원)·층·건축년도.",
    sourceFile: "실거래가 조회(아파트,연립다세대,오피스텔)_20260717.xlsx",
  },
  {
    key: "real_deal_house",
    dataset: "real_deal_house",
    label: "실거래가(단독·다가구)",
    organization: "0010",
    path: "/v1/kr/real-estate/general/real-transaction-price/house",
    authLevel: "public",
    bulk: true,
    description: "단독·다가구 실거래 매매·전월세.",
    sourceFile: "실거래가 조회(단독다가구)_20260717.xlsx",
  },
  {
    key: "apt_official_price",
    dataset: "official_price_apt",
    label: "공동주택 공시가격",
    organization: "0007",
    path: "/v1/kr/public/lt/rtms-real-estate/apt-price",
    authLevel: "secure",
    bulk: true,
    description: "부동산 공시가격 알리미 — 공동주택(아파트) 공시가격.",
    sourceFile: "부동산 공시가격 알리미 공동주택 공시가격_20260717.xlsx",
  },
  {
    key: "house_official_price",
    dataset: "official_price_house",
    label: "개별주택 가격",
    organization: "0007",
    path: "/v1/kr/public/lt/rtms-real-estate/house-price",
    authLevel: "secure",
    bulk: true,
    description: "부동산 공시가격 알리미 — 개별(단독)주택 공시가격.",
    sourceFile: "부동산 공시가격 알리미 개별주택 가격_20260717.xlsx",
  },
  {
    key: "land_official_price",
    dataset: "official_land_price",
    label: "개별공시지가(일사편리)",
    organization: "0001",
    path: "/v1/kr/public/lt/ilsafyeon-real-estate/land-price",
    authLevel: "secure",
    bulk: true,
    description: "일사편리 토지 개별공시지가.",
    sourceFile: "일사편리 토지 개별공시지가_20260717.xlsx",
  },
  {
    key: "rtms_lease_history",
    dataset: "rtms_lease",
    label: "임대차 신고이력",
    organization: "0005",
    path: "/v1/kr/public/lt/rtms-real-estate/lease-declaration",
    authLevel: "cert",
    bulk: false,
    description: "부동산거래관리시스템 임대차 신고이력 — 공동인증서 필요(본인 물건).",
    sourceFile: "부동산거래관리시스템 임대차신고이력_20260717.xlsx",
  },
  {
    key: "rtms_deal_history",
    dataset: "rtms_deal",
    label: "매매 신고이력",
    organization: "0005",
    path: "/v1/kr/public/lt/rtms-real-estate/declaration",
    authLevel: "cert",
    bulk: false,
    description: "부동산거래관리시스템 신고이력·자금조달계획 — 공동인증서 필요(본인 물건).",
    sourceFile: "부동산거래관리시스템 신고이력_20260717.xlsx",
  },
];

export function getCodefProduct(key: string): CodefProduct | undefined {
  return CODEF_PRODUCTS.find((p) => p.key === key);
}

/** 대량 시장 데이터 수집에 쓰는 상품(본인인증 불필요) */
export const CODEF_BULK_PRODUCTS = CODEF_PRODUCTS.filter((p) => p.bulk);
