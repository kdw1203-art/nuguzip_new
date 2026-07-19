import type { DataSourceId, LocationRef } from "@/lib/public-data/types";

/**
 * MOLIT 실거래/모크 공통으로 쓰기 쉬운 정규화 한 줄.
 * `fetchPublicData("mot-transactions", …)` 응답을 어댑터에 넣기 전/후에 매핑하는 용도.
 */
export interface RealTransactionRow {
  yyyymm: string;
  city?: string;
  district?: string;
  complexName?: string;
  jibun?: string;
  areaM2?: number;
  priceWon: number;
  floor?: string;
  buildYear?: number;
  dealCount?: number;
}

/**
 * `mockMotTransactions` 등 월 집계와 단건 행을 맞출 때 쓰는 정규화 shape (테스트·대시보드).
 */
export interface NormalizedTransactionMonth {
  yyyymm: string;
  avgPrice: number;
  count: number;
}

export interface PublicDataAdapter {
  getTransactions: (
    source: DataSourceId,
    params: LocationRef & Record<string, string>,
  ) => Promise<{
    months?: NormalizedTransactionMonth[];
    rows?: RealTransactionRow[];
  }>;
}
