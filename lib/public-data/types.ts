export type DataSourceId =
  | "mot-transactions" // 국토교통부 실거래가 (MOLIT)
  | "kosis-population" // 통계청 인구통계 (KOSIS)
  | "facilities" // 서울 열린데이터광장 시설
  | "schools" // 학교알리미 / 교육청
  | "redevelopment" // 정비사업몽땅
  | "ex-congestion"; // 한국도로공사 혼잡빈도

export interface LocationRef {
  city?: string;
  district?: string;
  yyyymm?: string;
}

export interface DataEnvelope<T> {
  source: DataSourceId;
  fromCache: boolean;
  fetchedAt: string;
  data: T;
  /** 응답 최상위 라벨 — data.mode 와 동기 (클라이언트가 envelope만 봐도 구분) */
  mode?: "live" | "mock" | "unavailable";
  unavailableReason?: string;
}
