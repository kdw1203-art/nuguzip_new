/**
 * 정비사업(재개발·재건축·소규모 등) 지도 — 공용 택소노미·타입.
 *
 * jaegebal.com 벤치마크의 "사업종류" 분류(민간주도·공공주도·소규모·기타)를
 * 그대로 반영하되, 지도 마커 색상은 서로 구분되도록 배정한다.
 * 데이터는 공개 자료 정리본(정비사업 정보몽땅·지자체 고시·언론 공개정보)이며,
 * 좌표는 구역 대표점 근사값, 진행단계는 공개 자료 기준 참고값이다.
 */

/** 사업종류 대분류 */
export type ProjectGroupKey = "private" | "public" | "small" | "etc";

export const PROJECT_GROUPS: { key: ProjectGroupKey; label: string }[] = [
  { key: "private", label: "민간주도" },
  { key: "public", label: "공공주도" },
  { key: "small", label: "소규모" },
  { key: "etc", label: "기타" },
];

/** 사업종류 세부 (jaegebal 분류 반영) */
export type ProjectTypeKey =
  | "redev" // 재개발
  | "shintong" // 신통기획(신속통합기획)
  | "private_dosim" // 민간도심복합
  | "recon_house" // 재건축(단독주택)
  | "recon_apt" // 재건축(아파트)
  | "regional_union" // 지역주택조합
  | "public_redev" // 공공재개발
  | "dosim_public" // 도심공공복합
  | "station_area" // 역세권활성화
  | "long_jeonse" // 장기전세(역세권시프트)
  | "moa" // 모아타운
  | "garo" // 가로주택정비
  | "small_scale" // 소규모재건축·재개발
  | "virtual"; // 가상구역

export type ProjectTypeMeta = {
  key: ProjectTypeKey;
  label: string;
  group: ProjectGroupKey;
  /** 지도 마커·범례 색상 (HEX) */
  color: string;
};

/** 세부 사업종류 메타 — 라벨·그룹·색상 단일 소스. */
export const PROJECT_TYPES: ProjectTypeMeta[] = [
  // 민간주도
  { key: "redev", label: "재개발", group: "private", color: "#2563eb" },
  { key: "shintong", label: "신통기획", group: "private", color: "#e5484d" },
  { key: "private_dosim", label: "민간도심복합", group: "private", color: "#0d9488" },
  { key: "recon_house", label: "재건축(단독주택)", group: "private", color: "#3b82f6" },
  { key: "recon_apt", label: "재건축(아파트)", group: "private", color: "#7c3aed" },
  { key: "regional_union", label: "지역주택조합", group: "private", color: "#f59e0b" },
  // 공공주도
  { key: "public_redev", label: "공공재개발", group: "public", color: "#1d4ed8" },
  { key: "dosim_public", label: "도심공공복합", group: "public", color: "#10b981" },
  { key: "station_area", label: "역세권활성화", group: "public", color: "#fb7a1e" },
  { key: "long_jeonse", label: "장기전세(역세권시프트)", group: "public", color: "#ec4899" },
  // 소규모
  { key: "moa", label: "모아타운", group: "small", color: "#22c55e" },
  { key: "garo", label: "가로주택", group: "small", color: "#15803d" },
  { key: "small_scale", label: "소규모", group: "small", color: "#38bdf8" },
  // 기타
  { key: "virtual", label: "가상구역", group: "etc", color: "#6b7280" },
];

const TYPE_BY_KEY: Record<string, ProjectTypeMeta> = Object.fromEntries(
  PROJECT_TYPES.map((t) => [t.key, t]),
);

export function typeMeta(key: string): ProjectTypeMeta {
  return TYPE_BY_KEY[key] ?? { key: "virtual", label: key || "기타", group: "etc", color: "#6b7280" };
}

export function colorForType(key: string): string {
  return typeMeta(key).color;
}

export function labelForType(key: string): string {
  return typeMeta(key).label;
}

export function isProjectTypeKey(v: string): v is ProjectTypeKey {
  return v in TYPE_BY_KEY;
}

export function typesInGroup(group: ProjectGroupKey): ProjectTypeMeta[] {
  return PROJECT_TYPES.filter((t) => t.group === group);
}

/** 진행단계 — 도시정비법 일반 절차 기준 축약(구역지정→준공). 필터·범례 공용. */
export type StageKey =
  | "designated" // 구역지정·후보
  | "committee" // 추진위·준비
  | "union" // 조합설립
  | "plan_approved" // 사업시행인가
  | "mgmt_approved" // 관리처분인가
  | "moving" // 이주·철거·착공
  | "done"; // 준공·입주

export type StageMeta = { key: StageKey; label: string; order: number };

export const STAGES: StageMeta[] = [
  { key: "designated", label: "구역지정", order: 1 },
  { key: "committee", label: "추진위·준비", order: 2 },
  { key: "union", label: "조합설립", order: 3 },
  { key: "plan_approved", label: "사업시행인가", order: 4 },
  { key: "mgmt_approved", label: "관리처분인가", order: 5 },
  { key: "moving", label: "이주·철거·착공", order: 6 },
  { key: "done", label: "준공·입주", order: 7 },
];

const STAGE_BY_KEY: Record<string, StageMeta> = Object.fromEntries(
  STAGES.map((s) => [s.key, s]),
);

export function stageLabel(key: string): string {
  return STAGE_BY_KEY[key]?.label ?? key ?? "";
}

export function stageOrder(key: string): number {
  return STAGE_BY_KEY[key]?.order ?? 0;
}

export function isStageKey(v: string): v is StageKey {
  return v in STAGE_BY_KEY;
}

/** 지도·목록에서 쓰는 정비사업장 단일 레코드 (공개 조회 안전 필드만). */
export type RedevelopmentProject = {
  id: string;
  name: string;
  typeKey: ProjectTypeKey;
  stageKey: StageKey;
  sido: string; // 시·도 (예: 서울)
  sigungu: string; // 시군구 (예: 강남구)
  address: string | null;
  lat: number;
  lng: number;
  households: number | null; // 예정 세대수(공개 자료 기준, 없으면 null)
  summary: string | null;
  source: string | null; // 출처 라벨
  sourceUrl: string | null; // 출처 링크
  isSample: boolean;
  updatedAt: string | null;
};

export type ProjectFilter = {
  types?: ProjectTypeKey[];
  stages?: StageKey[];
  sigungu?: string;
  bbox?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  limit?: number;
};
