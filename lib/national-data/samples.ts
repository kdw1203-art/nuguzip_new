/** 전국 표준·파일데이터 샘플 (키 없을 때 district 필터 가능) */

export type GeoSampleRow = {
  name: string;
  district: string;
  city?: string;
  address?: string;
  category?: string;
  lat?: number;
  lng?: number;
  meta?: Record<string, string | number>;
};

function filterDistrict<T extends { district: string }>(rows: T[], district?: string): T[] {
  if (!district?.trim()) return rows;
  const needle = district.replace(/구$/, "").trim();
  return rows.filter(
    (r) => r.district.includes(needle) || r.district.replace(/구$/, "").includes(needle),
  );
}

export const COMMERCIAL_SAMPLES: GeoSampleRow[] = [
  { name: "강남역 상권", district: "강남구", category: "유흥·음식", meta: { stores: 842, salesIndex: 118 } },
  { name: "홍대입구 골목", district: "마포구", category: "소매·F&B", meta: { stores: 612, salesIndex: 95 } },
  { name: "잠실 롯데타워", district: "송파구", category: "복합상권", meta: { stores: 430, salesIndex: 132 } },
  { name: "성수 카페거리", district: "성동구", category: "카페·F&B", meta: { stores: 188, salesIndex: 88 } },
];

export const PARKING_SAMPLES: GeoSampleRow[] = [
  { name: "코엑스 지하주차장", district: "강남구", address: "영동대로 513", meta: { spaces: 3200, feePerHour: 4000 } },
  { name: "여의도공원 주차장", district: "영등포구", meta: { spaces: 890, feePerHour: 2000 } },
  { name: "올림픽공원 주차장", district: "송파구", meta: { spaces: 2100, feePerHour: 1500 } },
];

export const PARK_SAMPLES: GeoSampleRow[] = [
  { name: "한강시민공원", district: "영등포구", meta: { areaHa: 88.2 } },
  { name: "선릉·정릉", district: "강남구", meta: { areaHa: 12.4 } },
  { name: "서울숲", district: "성동구", meta: { areaHa: 35.0 } },
];

export const CHILDCARE_ZONE_SAMPLES: GeoSampleRow[] = [
  { name: "강남초등학교 어린이보호구역", district: "강남구", address: "역삼동", meta: { radiusM: 300 } },
  { name: "잠실중학교 어린이보호구역", district: "송파구", meta: { radiusM: 300 } },
];

export const PUBLIC_FACILITY_SAMPLES: GeoSampleRow[] = [
  { name: "강남구민회관", district: "강남구", category: "주민센터·복지", meta: { openHours: "09-18" } },
  { name: "송파구민체육센터", district: "송파구", category: "체육시설" },
];

export const MULTI_USE_SAMPLES: GeoSampleRow[] = [
  { name: "○○노래연습장", district: "강남구", category: "노래연습", meta: { fireGrade: "양호" } },
  { name: "△△PC방", district: "마포구", category: "PC방", meta: { fireGrade: "양호" } },
];

export const FESTIVAL_SAMPLES: GeoSampleRow[] = [
  { name: "서울 빛초롱축제", district: "중구", category: "문화축제", meta: { month: 11 } },
  { name: "한강 벚꽃축제", district: "영등포구", category: "축제", meta: { month: 4 } },
];

export const PENSION_SAMPLES: GeoSampleRow[] = [
  { name: "강남구 사업장 밀집", district: "강남구", meta: { workplaces: 12400 } },
  { name: "송파구 사업장 밀집", district: "송파구", meta: { workplaces: 9800 } },
];

export const CONSTRUCTION_SAMPLES: GeoSampleRow[] = [
  { name: "강남 재건축 현장", district: "강남구", meta: { sites: 18 } },
  { name: "송파 신축 현장", district: "송파구", meta: { sites: 24 } },
];

export const LEARNING_SAMPLES: GeoSampleRow[] = [
  { name: "강남구 평생학습관", district: "강남구", category: "교양", meta: { courses: 42 } },
  { name: "마포구 디지털교육", district: "마포구", category: "IT", meta: { courses: 28 } },
];

export const IMU_SAMPLES: GeoSampleRow[] = [
  { name: "인천 IC-1 IMU", district: "남동구", city: "인천", meta: { sensorId: "IMU-001", roadClass: "간선" } },
  { name: "인천 IC-2 IMU", district: "연수구", city: "인천", meta: { sensorId: "IMU-002", roadClass: "지선" } },
];

export function sampleRows(kind: keyof typeof SAMPLE_MAP, district?: string, limit = 10): GeoSampleRow[] {
  const rows = SAMPLE_MAP[kind];
  return filterDistrict(rows, district).slice(0, limit);
}

const SAMPLE_MAP = {
  commercial: COMMERCIAL_SAMPLES,
  parking: PARKING_SAMPLES,
  park: PARK_SAMPLES,
  childcare: CHILDCARE_ZONE_SAMPLES,
  publicFacility: PUBLIC_FACILITY_SAMPLES,
  multiUse: MULTI_USE_SAMPLES,
  festival: FESTIVAL_SAMPLES,
  pension: PENSION_SAMPLES,
  construction: CONSTRUCTION_SAMPLES,
  learning: LEARNING_SAMPLES,
  imu: IMU_SAMPLES,
} as const;
