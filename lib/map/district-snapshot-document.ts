/** Mongo 스타일 district workspace 문서 — district_snapshots.payload 스키마 */

export type DistrictSnapshotDocument = {
  districtKey: string;
  snapshotMonth: string;
  population?: {
    total: number;
    households: number;
    source: string;
  };
  safety?: {
    /** 행정구역 집계형 위험 지표 — 개인·주소 단위 원자료 UI 노출 금지 */
    crimeRiskIndex: number;
    trafficAccidentIndex: number;
    cctvCount: number;
  };
  transport?: {
    subwayCrowding: Array<{ station: string; peak: number }>;
  };
  education?: {
    schoolCount: number;
    highSchoolZone?: string;
  };
  redevelopment?: {
    count: number;
    topProjects: string[];
  };
  transactions?: {
    saleCount?: number;
    rentCount?: number;
    jeonseRatio?: number;
  };
};

export function buildDistrictKey(parts: {
  sido: string;
  sigungu: string;
  eupmyeondong?: string;
}): string {
  const sido = parts.sido.replace(/특별시|광역시|특별자치시|도/g, "").trim() || parts.sido;
  const segs = [sido, parts.sigungu, parts.eupmyeondong].filter(Boolean);
  return segs.join("-");
}

export function parseDistrictKey(key: string): {
  sidoShort: string;
  sigungu: string;
  eupmyeondong?: string;
} {
  const [sidoShort, sigungu, eupmyeondong] = key.split("-");
  return { sidoShort: sidoShort ?? "", sigungu: sigungu ?? "", eupmyeondong };
}

export function snapshotMonthToYm(month: string): string {
  return month.replace("-", "");
}

export function ymToSnapshotMonth(ym: string): string {
  if (ym.length !== 6) return ym;
  return `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;
}

/** ETL·데모용 참조 문서 (강남구 대치동) */
export const SAMPLE_DAECHI_SNAPSHOT: DistrictSnapshotDocument = {
  districtKey: "서울-강남구-대치동",
  snapshotMonth: "2026-06",
  population: {
    total: 35210,
    households: 14120,
    source: "MOIS",
  },
  safety: {
    crimeRiskIndex: 62,
    trafficAccidentIndex: 48,
    cctvCount: 312,
  },
  transport: {
    subwayCrowding: [
      { station: "대치", peak: 78 },
      { station: "삼성", peak: 84 },
    ],
  },
  education: {
    schoolCount: 14,
    highSchoolZone: "강남 평준화 학군",
  },
  redevelopment: {
    count: 3,
    topProjects: ["은마", "개포A", "삼성B"],
  },
};

export function isDistrictSnapshotDocument(v: unknown): v is DistrictSnapshotDocument {
  if (!v || typeof v !== "object") return false;
  const o = v as DistrictSnapshotDocument;
  return typeof o.districtKey === "string" && typeof o.snapshotMonth === "string";
}
