/** 한국도로공사 혼잡빈도 CSV 컬럼 (공공데이터포털 15045664) */
export type ExCongestionFrequencyRow = {
  /** 집계년월 YYYYMM */
  aggYyyymm: string;
  /** 집계시분 HH:mm */
  aggTime: string;
  vdsId: string;
  /** 기점종점방향구분코드 (E/W/S/N 등) */
  directionCode: string;
  /** 노선번호 (1=경부, 35=경인, 50=영동 등) */
  routeNo: number;
  /** 지점이정 km */
  pointKm: number;
  /** 도로이정 km */
  roadKm: number;
  avgTrafficVolume: number;
  avgSpeedKmh: number;
  congestionFrequency: number;
  laneNo: number;
  /** 콘존명 (구간명) */
  zoneName: string;
  zoneLengthKm: number;
};

export type ExCongestionQuery = {
  routeNo?: number;
  yyyymm?: string;
  zoneQuery?: string;
  minFrequency?: number;
  limit?: number;
};

export type ExCongestionSummary = {
  yyyymm: string;
  routeNo: number | null;
  totalRows: number;
  hotspots: Array<{
    zoneName: string;
    routeNo: number;
    peakTime: string;
    avgSpeedKmh: number;
    avgTrafficVolume: number;
    maxCongestionFrequency: number;
    zoneLengthKm: number;
  }>;
  rows: ExCongestionFrequencyRow[];
  mode: "sample" | "live";
  sourceUrl: string;
  portalUrl: string;
  license: string;
  updatedAt: string;
};
