import { getBackendMode, type DataEnvelope, type LocationRef } from "./types";

/**
 * 학교알리미 / 시·도 교육청 API.
 * 공식: https://www.schoolinfo.go.kr/
 *
 * 아직 실제 연동이 없다 — 어댑터도, 인증키를 읽는 코드도 없다.
 * 그래서 이 모듈은 "모른다"를 그대로 돌려준다.
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
  /** null 은 "세지 못했다" — 0("없다")과 다른 말이다. */
  primaryCount: number | null;
  middleCount: number | null;
  highCount: number | null;
  schools: SchoolInfo[];
};

/* 사실 우선: 여기 있던 mockSchools() 를 삭제했다.
   지역명 길이를 시드로 "한빛초등학교 · 교사 1인당 학생 17명 · 진학률 84%"
   같은 학교를 임의 좌표에 만들어 냈고, attribution 은 "교육부 학교알리미"였다 —
   존재하지 않는 학교를 정부 출처 이름표로 보여주는 값이다.
   실제 연동(어댑터 + 인증키)이 생기기 전까지는 "모른다"로 답한다. */
function unavailableSchools(location: LocationRef): SchoolSummary {
  return { location, primaryCount: null, middleCount: null, highCount: null, schools: [] };
}

export async function getSchoolSummary(
  location: LocationRef,
): Promise<DataEnvelope<SchoolSummary>> {
  const mode = getBackendMode();
  void mode; // 실 어댑터가 없으므로 live 로 표기할 수 있는 경로 자체가 없다.
  return {
    source: "schools",
    sourceLabel: "학군 (미연동)",
    unit: "COUNT",
    viz: "list",
    updatedAt: new Date().toISOString().slice(0, 10),
    mode: "mock",
    attribution: "학교알리미 미연동 — 학군 데이터를 불러오지 못했습니다",
    isLocationBased: true,
    data: unavailableSchools(location),
  };
}
