/**
 * 외부 데이터 어댑터 레지스트리.
 *
 * 사용 방법:
 *   import { DATA_SOURCES, getRealEstateSummary } from "@/lib/datasources";
 *   const env = await getRealEstateSummary({ city: "서울", district: "강남구" });
 *   // env.mode === "mock" 면 더미, "live" 면 실 API
 *
 * 실제 API 연동 시 체크리스트:
 *   1. 해당 모듈의 함수 본문만 fetch 구현으로 교체
 *   2. `NEXT_PUBLIC_DATA_BACKEND=live` 설정 (클라이언트 노출은 URL 만)
 *   3. 인증키는 서버 전용 env (예: `MOLIT_SERVICE_KEY`) 로 보관하고
 *      서버 route 를 통해 중계할 것
 */

export * from "./types";
export * from "./mot-transactions";
export * from "./kostat-population";
export * from "./facilities";
export * from "./schools";
export * from "./redevelopment";
export * from "./weekly-prices";

export const DATA_SOURCES = [
  {
    id: "mot-transactions",
    label: "국토교통부 실거래가",
    description: "아파트 실거래 평균가·최근 거래 내역",
    envKey: "MOLIT_SERVICE_KEY",
    docsUrl: "https://www.data.go.kr/data/15057511/openapi.do",
  },
  {
    id: "kostat-population",
    label: "통계청 인구통계",
    description: "시·군·구 인구, 세대수, 연령별 분포",
    envKey: "KOSIS_SERVICE_KEY",
    docsUrl: "https://kosis.kr/openapi/",
  },
  {
    id: "public-facilities",
    label: "생활편의시설",
    description: "병원·약국·마트·지하철·공원 위치/개수",
    envKey: "SEOUL_DATA_API_KEY",
    docsUrl: "https://data.seoul.go.kr/",
  },
  {
    id: "schools",
    label: "학교알리미 · 교육청",
    description: "학군 정보, 학교별 평가/통학 반경",
    envKey: "SCHOOLINFO_API_KEY",
    docsUrl: "https://www.schoolinfo.go.kr/",
  },
  {
    id: "redevelopment-mongddang",
    label: "정비사업(upisRebuild)",
    description: "재개발·재건축 진행 단계, 구역명, 면적",
    envKey: "SEOUL_DATA_API_KEY",
    docsUrl: "https://data.seoul.go.kr/",
  },
  {
    id: "reb-weekly-prices",
    label: "한국부동산원 주간동향",
    description: "주간 시세 변동률, 거래량",
    envKey: "REB_SERVICE_KEY",
    docsUrl: "https://www.reb.or.kr/",
  },
  {
    id: "ex-congestion-frequency",
    label: "한국도로공사 혼잡빈도",
    description: "고속도로 VDS 구간 혼잡빈도·평균속도 (CSV/샘플)",
    envKey: "EX_DATA_API_KEY",
    docsUrl: "https://www.data.go.kr/data/15045664/fileData.do",
  },
  {
    id: "applyhome-competition",
    label: "청약홈 경쟁률 (odcloud)",
    description: "APT 분양정보·경쟁률·특별공급 신청현황",
    envKey: "DATA_GO_KR_SERVICE_KEY",
    docsUrl: "https://www.data.go.kr/data/15125682/openapi.do",
  },
] as const;

export type DataSourceId = (typeof DATA_SOURCES)[number]["id"];
