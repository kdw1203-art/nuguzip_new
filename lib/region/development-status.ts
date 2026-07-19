// ─── 지역 개발현황(재건축·재개발·교통호재) 요약 ──────────────────
// 지도 카드·필터·상세에서 동기적으로 쓰는 경량 개발 지표.
// 서울 정비사업 Open API(lib/datasources/redevelopment.ts)의 라이브 데이터는
// 상세 진입 시 비동기로 보강하고, 여기서는 카드/필터용 요약을 제공한다.

import type { DemoRegion } from "./explore-data";

export type DevelopmentTag =
  | "재건축"
  | "재개발"
  | "정비구역"
  | "신축분양"
  | "GTX"
  | "교통호재"
  | "학군"
  | "직주근접";

export type DevelopmentLevel = "활발" | "보통" | "정체";

export interface DevelopmentStatus {
  level: DevelopmentLevel;
  /** 진행 중 정비사업(추정) 건수 */
  activeProjects: number;
  tags: DevelopmentTag[];
  headline: string;
}

/** 구별 큐레이션 호재 (대표 지역은 실제 이슈 반영) */
const CURATED: Record<string, { tags: DevelopmentTag[]; projects: number }> = {
  강남구: { tags: ["재건축", "학군", "GTX"], projects: 9 },
  서초구: { tags: ["재건축", "학군"], projects: 7 },
  송파구: { tags: ["재건축", "교통호재"], projects: 8 },
  마포구: { tags: ["신축분양", "직주근접"], projects: 5 },
  용산구: { tags: ["재개발", "교통호재", "GTX"], projects: 6 },
  영등포구: { tags: ["재개발", "직주근접"], projects: 5 },
  강동구: { tags: ["재건축", "신축분양"], projects: 6 },
  동대문구: { tags: ["재개발", "GTX"], projects: 4 },
  성동구: { tags: ["재개발", "직주근접"], projects: 4 },
  노원구: { tags: ["재건축", "GTX"], projects: 5 },
  // ── 수도권 ──
  "성남시 분당구": { tags: ["재건축", "GTX", "학군"], projects: 7 },
  "수원시 영통구": { tags: ["신축분양", "GTX", "학군"], projects: 5 },
  "안양시 동안구": { tags: ["재건축", "교통호재"], projects: 4 },
  "하남시": { tags: ["신축분양", "교통호재", "GTX"], projects: 5 },
  "화성시 동탄": { tags: ["신축분양", "GTX", "직주근접"], projects: 6 },
  "광명시": { tags: ["재개발", "교통호재"], projects: 5 },
  "과천시": { tags: ["재건축", "직주근접"], projects: 4 },
  연수구: { tags: ["신축분양", "직주근접", "교통호재"], projects: 5 },
  서구: { tags: ["신축분양", "GTX"], projects: 5 },
  "고양시 일산동구": { tags: ["재건축", "GTX"], projects: 4 },
  "김포시": { tags: ["신축분양", "교통호재"], projects: 4 },
};

/** 구(區) 큐레이션 개발 태그 — 좌표 없이 지역 단위로 단지 강조/필터에 사용. */
export function curatedDevelopmentTags(district: string): DevelopmentTag[] {
  return CURATED[district]?.tags ?? [];
}

/** 해당 구에 재건축·재개발·신축분양 호재가 있는지 */
export function hasRedevelopmentOrPresale(district: string): boolean {
  return curatedDevelopmentTags(district).some(
    (t) => t === "재건축" || t === "재개발" || t === "신축분양",
  );
}

const KEYWORD_TAG: Array<{ re: RegExp; tag: DevelopmentTag }> = [
  { re: /재건축/, tag: "재건축" },
  { re: /재개발|정비/, tag: "재개발" },
  { re: /신축/, tag: "신축분양" },
  { re: /GTX|지하철|교통/, tag: "교통호재" },
  { re: /직주|업무|IT|판교/, tag: "직주근접" },
  { re: /학군/, tag: "학군" },
];

/** 지역의 개발현황 요약을 동기적으로 계산 */
export function getDevelopmentStatus(region: DemoRegion): DevelopmentStatus {
  const curated = CURATED[region.district];
  const tagSet = new Set<DevelopmentTag>(curated?.tags ?? []);
  for (const kw of region.topKeywords) {
    for (const { re, tag } of KEYWORD_TAG) {
      if (re.test(kw)) tagSet.add(tag);
    }
  }
  const tags = [...tagSet].slice(0, 4);

  const activeProjects =
    curated?.projects ?? Math.max(1, Math.round(region.newListings / 9) + (tags.includes("재건축") ? 2 : 0));

  const hasMajor = tags.some((t) => t === "재건축" || t === "재개발" || t === "GTX");
  let level: DevelopmentLevel;
  if ((hasMajor && region.priceChange >= 2) || region.priceChange >= 4.5) level = "활발";
  else if (region.priceChange <= 0 && !hasMajor) level = "정체";
  else level = "보통";

  const headline =
    tags.length > 0
      ? `${tags.slice(0, 2).join("·")} 등 정비사업 ${activeProjects}건 진행`
      : `정비사업 ${activeProjects}건 모니터링`;

  return { level, activeProjects, tags, headline };
}

export const DEVELOPMENT_LEVEL_STYLE: Record<
  DevelopmentLevel,
  { label: string; chip: string; dot: string }
> = {
  활발: { label: "개발 활발", chip: "bg-rose-50 text-rose-600 border-rose-200", dot: "bg-rose-500" },
  보통: { label: "개발 보통", chip: "bg-amber-50 text-amber-600 border-amber-200", dot: "bg-amber-500" },
  정체: { label: "개발 정체", chip: "bg-slate-100 text-slate-500 border-slate-200", dot: "bg-slate-400" },
};
