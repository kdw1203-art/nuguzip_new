/**
 * 공공데이터 / 외부 API 통합을 위한 공통 계약.
 *
 * 현재 모든 어댑터는 `dummy` 백엔드로 동작하며, 실제 API 연동 시 동일한
 * 시그니처로 교체만 하면 UI 수정이 필요 없도록 설계했습니다.
 *
 * 새 어댑터를 추가할 때는:
 *  1. `LocationRef` 를 입력으로 받고
 *  2. `DataEnvelope<T>` 로 감싸 리턴
 *  3. `getXxx(params): Promise<DataEnvelope<T>>` 형태로 export
 *  4. `lib/datasources/index.ts` 에 등록
 */

export type BackendMode = "mock" | "live";

export type LocationRef = {
  /** 시·도 (예: "서울특별시") */
  city: string;
  /** 시·군·구 (예: "강남구") */
  district?: string;
  /** 법정/행정동 또는 단지명 (옵션) */
  dong?: string;
  /** 좌표가 있으면 함께 전달 */
  lat?: number;
  lng?: number;
};

export type DateRange = {
  /** YYYY-MM-DD */
  from?: string;
  to?: string;
};

export type DataUnit =
  | "KRW"
  | "KRW_PER_M2"
  | "PERCENT"
  | "PEOPLE"
  | "HOUSEHOLDS"
  | "COUNT"
  | "METERS"
  | "NONE";

export type Visualization = "map_marker" | "card_number" | "line_chart" | "bar_chart" | "list";

export type DataEnvelope<T> = {
  /** 어댑터 식별자 (예: "mot-transactions") */
  source: string;
  /** 표시용 한글 라벨 */
  sourceLabel: string;
  /** 데이터 단위 */
  unit: DataUnit;
  /** UI 힌트 */
  viz: Visualization;
  /** 마지막으로 집계된 날짜 (YYYY-MM-DD 또는 ISO) */
  updatedAt: string;
  /** 실제 또는 목업 여부 */
  mode: BackendMode;
  /** 공식 출처(URL/기관명) 등 */
  attribution?: string;
  /** 지도 표현 여부 */
  isLocationBased: boolean;
  /** 본문 데이터 */
  data: T;
};

/** 전역 설정을 env 변수 기반으로 읽습니다. */
export function getBackendMode(envKey?: string): BackendMode {
  if (envKey?.trim() && process.env[envKey]?.trim()) return "live";
  const v = process.env.NEXT_PUBLIC_DATA_BACKEND?.toLowerCase();
  return v === "live" ? "live" : "mock";
}
