/** KB·R-ONE 통합 시장 데이터 공통 타입 */

export type MarketSource = "reb" | "kb" | "crawl" | "kosis";
export type PropertyType = "apt" | "officetel" | "house";
export type PeriodType = "weekly" | "monthly";

export type MarketMetric =
  | "sale_index" // 매매가격지수 (기준=100)
  | "jeonse_index" // 전세가격지수
  | "sale_change" // 매매 변동률(%)
  | "jeonse_change" // 전세 변동률(%)
  | "jeonse_ratio" // 전세가율(%)
  | "trade_count" // 거래량(호)
  | "buy_superiority" // 매매수급동향(매수우위지수)
  | "jeonse_supply" // 전세수급동향
  // ── KOSIS 보조지표(인구·세대·공급) ──
  | "population" // 주민등록 인구(명)
  | "households" // 세대수(세대)
  | "unsold_units" // 미분양 주택(호)
  | "housing_supply_ratio"; // 주택보급률(%)

/** 한 지역의 KOSIS 보조지표 스냅샷 (인구·세대·미분양·보급률) */
export interface RegionDemographics {
  regionId: string;
  regionName: string;
  period: string; // yyyymm or yyyy
  population?: number;
  households?: number;
  unsoldUnits?: number;
  housingSupplyRatio?: number;
}

export interface MarketSeriesRow {
  source: MarketSource;
  regionId: string;
  regionName: string;
  level: "sido" | "sigungu";
  propertyType: PropertyType;
  metric: MarketMetric;
  periodType: PeriodType;
  /** YYYY-MM-DD */
  period: string;
  value: number;
  /** YYYY-MM-DD */
  datasetDate?: string;
}

export interface MarketRegionPriceRow {
  source: MarketSource;
  regionId: string;
  regionName: string;
  propertyType: PropertyType;
  /** yyyymm */
  period: string;
  avgSale?: number;
  medianSale?: number;
  perM2Sale?: number;
  avgJeonse?: number;
  jeonseRatio?: number;
  saleChange?: number;
  tradeCount?: number;
  buySuperiority?: number;
  jeonseSupply?: number;
}

/** 한 지역에 대한 최신 시장 스냅샷 (기능에서 소비하는 형태) */
export interface RegionMarketSnapshot {
  regionId: string;
  regionName: string;
  source: MarketSource;
  period: string; // yyyymm
  perM2Sale?: number;
  avgSale?: number;
  medianSale?: number;
  jeonseRatio?: number;
  saleChangeMonthly?: number; // 월간 변동률(%)
  saleChangeWeekly?: number; // 주간 변동률(%)
  tradeCount?: number;
  buySuperiority?: number;
  jeonseSupply?: number;
}
