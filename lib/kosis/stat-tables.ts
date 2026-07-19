/**
 * KOSIS 부동산 보조지표 통계표 레지스트리.
 *
 * ⚠️ KOSIS 통계표(orgId/tblId)는 표 개편으로 변동될 수 있습니다. 인증키 활성화 후
 *    /admin/market-data 에서 KOSIS 수집을 실행하면 표별 적재 건수가 로그에 남으므로,
 *    0건인 표는 KOSIS 통계목록에서 최신 orgId/tblId 로 교정하세요.
 *    (아래는 공표된 대표 표 기준 기본값입니다.)
 */
import type { MarketMetric } from "@/lib/market/types";

export interface KosisTable {
  /** 적재 식별 라벨 */
  label: string;
  orgId: string;
  tblId: string;
  /** 'M' 월간 | 'Y' 연간 */
  prdSe: "M" | "Y";
  /** 항목 ID (기본 ALL) */
  itmId?: string;
  /** 분류1 (지역) — 기본 ALL */
  objL1?: string;
  /** 분류2 — 필요 시 */
  objL2?: string;
  /** ITM_NM 부분일치 필터 (여러 항목 표에서 특정 항목만) */
  itmNmIncludes?: string;
  /** 매핑할 내부 지표 */
  metric: MarketMetric;
}

export const KOSIS_TABLES: KosisTable[] = [
  // 미분양주택현황 (국토교통부, 월간, 시군구)
  {
    label: "미분양주택현황",
    orgId: "116",
    tblId: "DT_MLTM_2082",
    prdSe: "M",
    metric: "unsold_units",
  },
  // 주민등록 세대수 (행정구역별, 월간)
  {
    label: "주민등록세대수",
    orgId: "101",
    tblId: "DT_1B040B3",
    prdSe: "M",
    metric: "households",
  },
  // 주민등록 인구 (행정구역별, 월간)
  {
    label: "주민등록인구",
    orgId: "101",
    tblId: "DT_1B040A3",
    prdSe: "M",
    metric: "population",
  },
  // 주택보급률 (연간, 시도)
  {
    label: "주택보급률",
    orgId: "116",
    tblId: "DT_2KAA101",
    prdSe: "Y",
    metric: "housing_supply_ratio",
  },
];
