/**
 * 한국부동산원(R-ONE) Open API 통계표 코드(STATBL_ID) — OpenAPI_통계코드.xls 에서 큐레이션.
 * 전국주택가격동향조사(월간/주간 아파트), 오피스텔 가격동향, 아파트 거래현황.
 */
import type { MarketMetric, PeriodType, PropertyType } from "@/lib/market/types";

export interface RebStat {
  /** 통계표 코드 */
  statblId: string;
  /** 주기 코드 (MM=월, WK=주) */
  cycle: "MM" | "WK";
  periodType: PeriodType;
  propertyType: PropertyType;
  /** 시계열 metric (series 적재) */
  metric?: MarketMetric;
  /** 가격 스냅샷 필드 (price 적재) */
  priceField?: "perM2Sale" | "avgSale" | "medianSale" | "avgJeonse";
  /** 항목명 필터(ITM_NM 포함) — 다항목 테이블에서 특정 항목만 사용 */
  itmIncludes?: string;
  /** 항목명 제외(ITM_NM 포함 시 제외) — 예: 거래현황에서 '면적' 제외하고 '거래건수'만 */
  itmExcludes?: string;
  label: string;
}

export const REB_STATS: RebStat[] = [
  // ── 월간 아파트: 시계열 지표 ──
  { statblId: "A_2024_00045", cycle: "MM", periodType: "monthly", propertyType: "apt", metric: "sale_index", label: "월간 매매가격지수(아파트)" },
  { statblId: "A_2024_00050", cycle: "MM", periodType: "monthly", propertyType: "apt", metric: "jeonse_index", label: "월간 전세가격지수(아파트)" },
  { statblId: "A_2024_00076", cycle: "MM", periodType: "monthly", propertyType: "apt", metric: "buy_superiority", label: "월간 매매수급동향(아파트)" },
  { statblId: "A_2024_00077", cycle: "MM", periodType: "monthly", propertyType: "apt", metric: "jeonse_supply", label: "월간 전세수급동향(아파트)" },
  { statblId: "A_2024_00072", cycle: "MM", periodType: "monthly", propertyType: "apt", metric: "jeonse_ratio", label: "월간 전세가율(아파트)" },
  // 거래현황 표는 ITM 으로 '거래건수'·'면적'(천㎡) 두 항목을 함께 제공 → '면적' 제외하고 건수만 적재
  { statblId: "A_2024_00549", cycle: "MM", periodType: "monthly", propertyType: "apt", metric: "trade_count", itmExcludes: "면적", label: "월간 아파트 거래현황(건수)" },

  // ── 월간 아파트: 절대가격 스냅샷 ──
  { statblId: "A_2024_00061", cycle: "MM", periodType: "monthly", propertyType: "apt", priceField: "perM2Sale", label: "월간 평균단위(㎡당) 매매가(아파트)" },
  { statblId: "A_2024_00060", cycle: "MM", periodType: "monthly", propertyType: "apt", priceField: "avgSale", label: "월간 평균 매매가(아파트)" },
  { statblId: "A_2024_00062", cycle: "MM", periodType: "monthly", propertyType: "apt", priceField: "medianSale", label: "월간 중위 매매가(아파트)" },
  { statblId: "A_2024_00064", cycle: "MM", periodType: "monthly", propertyType: "apt", priceField: "avgJeonse", label: "월간 평균 전세가(아파트)" },

  // ── 주간 아파트: 모멘텀 ──
  { statblId: "T244183132827305", cycle: "WK", periodType: "weekly", propertyType: "apt", metric: "sale_index", label: "주간 매매가격지수(아파트)" },
  { statblId: "T247713133046872", cycle: "WK", periodType: "weekly", propertyType: "apt", metric: "jeonse_index", label: "주간 전세가격지수(아파트)" },
  { statblId: "T248163133074619", cycle: "WK", periodType: "weekly", propertyType: "apt", metric: "buy_superiority", label: "주간 매매수급동향(아파트)" },
  { statblId: "T245423133086632", cycle: "WK", periodType: "weekly", propertyType: "apt", metric: "jeonse_supply", label: "주간 전세수급동향(아파트)" },

  // ── 월간 오피스텔: 매매가격지수 ──
  { statblId: "A_2024_00615", cycle: "MM", periodType: "monthly", propertyType: "officetel", metric: "sale_index", label: "월간 오피스텔 매매가격지수" },
];
