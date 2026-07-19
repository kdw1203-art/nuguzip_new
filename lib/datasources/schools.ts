import { getBackendMode, type DataEnvelope, type LocationRef } from "./types";

/**
 * 학교알리미 / 시·도 교육청 API.
 * 공식: https://www.schoolinfo.go.kr/
 */

export type SchoolLevel = "초등학교" | "중학교" | "고등학교";

export type SchoolInfo = {
  name: string;
  level: SchoolLevel;
  lat: number;
  lng: number;
  studentsPerTeacher: number;
  grade: "상" | "중상" | "중" | "중하" | "하";
  advanceRatePct: number;
  walkMinutes: number;
};

export type SchoolSummary = {
  location: LocationRef;
  primaryCount: number;
  middleCount: number;
  highCount: number;
  schools: SchoolInfo[];
};

function mockSchools(location: LocationRef): SchoolSummary {
  const seed = `${location.city}${location.district ?? ""}`.length;
  const baseLat = location.lat ?? 37.5665;
  const baseLng = location.lng ?? 126.978;
  const names = ["한빛", "동작", "신양", "우리", "하나", "푸른", "미래"];
  const grades: SchoolInfo["grade"][] = ["중상", "상", "중", "상", "중상"];
  const levels: SchoolLevel[] = ["초등학교", "중학교", "고등학교"];
  const schools: SchoolInfo[] = Array.from({ length: 5 }, (_, i) => ({
    name: `${names[(seed + i) % names.length]}${levels[i % 3]}`,
    level: levels[i % 3],
    lat: baseLat + ((seed + i) % 6) * 0.0008,
    lng: baseLng - ((seed + i) % 6) * 0.0008,
    studentsPerTeacher: 14 + ((seed + i) % 6),
    grade: grades[(seed + i) % grades.length],
    advanceRatePct: 78 + ((seed + i) % 12),
    walkMinutes: 6 + ((seed + i) % 12),
  }));
  return {
    location,
    primaryCount: 4 + (seed % 4),
    middleCount: 3 + (seed % 3),
    highCount: 2 + (seed % 2),
    schools,
  };
}

export async function getSchoolSummary(
  location: LocationRef,
): Promise<DataEnvelope<SchoolSummary>> {
  const mode = getBackendMode();
  return {
    source: "schools",
    sourceLabel: "학군 (학교알리미)",
    unit: "COUNT",
    viz: "list",
    updatedAt: new Date().toISOString().slice(0, 10),
    mode,
    attribution: "교육부 학교알리미 · 시·도 교육청",
    isLocationBased: true,
    data: mockSchools(location),
  };
}
