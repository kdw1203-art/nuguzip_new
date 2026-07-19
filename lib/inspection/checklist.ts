/**
 * Figma 의 SmartInspectionNote 체크리스트 그룹 요약본.
 * 전체 항목은 `platform-src/pages/SmartInspectionNotePage.tsx` 참고.
 */
export type ChecklistItemDef = { id: string; label: string; score: number };
export type ChecklistGroupDef = {
  id: string;
  title: string;
  items: ChecklistItemDef[];
};

export const CHECKLIST_GROUPS: ChecklistGroupDef[] = [
  {
    id: "location",
    title: "📍 입지·교통",
    items: [
      { id: "c1", label: "지하철역 도보 10분 이내", score: 10 },
      { id: "c2", label: "버스 정류장 3개 이상", score: 5 },
      { id: "c3", label: "주요 업무지구 접근 30분 이내", score: 8 },
      { id: "c4", label: "GTX·광역철도 수혜 예정", score: 7 },
      { id: "c5", label: "환승역 또는 급행 정차역 인근", score: 6 },
      { id: "c_tr1", label: "도로망 직접 연결 (IC·간선)", score: 4 },
    ],
  },
  {
    id: "complex",
    title: "🏢 단지·시설",
    items: [
      { id: "c6", label: "단지 관리상태 양호 (청결·보안)", score: 6 },
      { id: "c7", label: "주차공간 세대당 1.2대 이상", score: 5 },
      { id: "c8", label: "커뮤니티 시설 충실", score: 5 },
      { id: "c10", label: "세대 배치 채광·향 우수 (남향)", score: 6 },
      { id: "c_cx1", label: "단지 규모 500세대 이상", score: 5 },
      { id: "c_cx3", label: "조경·녹지 단지 내 충분", score: 3 },
    ],
  },
  {
    id: "interior",
    title: "🛋 내부구조·상태",
    items: [
      { id: "ci1", label: "평면 구조 효율적", score: 5 },
      { id: "ci2", label: "발코니 확장 가능/완료", score: 4 },
      { id: "ci3", label: "수압·배관 상태 양호", score: 4 },
      { id: "ci4", label: "결로·곰팡이 흔적 없음", score: 6 },
      { id: "ci5", label: "인테리어 교체 최근 완료 (5년 내)", score: 3 },
      { id: "ci6", label: "층간소음 방지 공사", score: 4 },
    ],
  },
  {
    id: "school",
    title: "🎓 학군·교육환경",
    items: [
      { id: "c11", label: "초등학교 도보 통학 (500m)", score: 8 },
      { id: "c12", label: "상위 중학군 학군", score: 9 },
      { id: "c13", label: "학원가 접근", score: 7 },
      { id: "cs1", label: "고등학교 배정 우수", score: 5 },
    ],
  },
  {
    id: "facility",
    title: "🏪 생활편의시설",
    items: [
      { id: "c14", label: "대형마트·백화점 10분 이내", score: 5 },
      { id: "c15", label: "병원·약국 도보권", score: 6 },
      { id: "c16", label: "공원·녹지 500m 이내", score: 5 },
      { id: "c17", label: "카페·식당 상권", score: 3 },
    ],
  },
  {
    id: "future",
    title: "🚀 미래가치·개발호재",
    items: [
      { id: "c18", label: "재건축·재개발 예정/진행", score: 10 },
      { id: "c19", label: "GTX 개통 예정", score: 8 },
      { id: "c20", label: "대형 쇼핑·업무단지 개발", score: 6 },
      { id: "c21", label: "공원·하천 정비 사업", score: 4 },
    ],
  },
];

export type InspectionChecklistIntent = "실거주" | "투자" | "전월세";

const INTENT_EXTRA_ITEMS: Record<
  InspectionChecklistIntent,
  Partial<Record<ChecklistGroupDef["id"], ChecklistItemDef[]>>
> = {
  실거주: {
    interior: [
      { id: "ci_l1", label: "층간·외부 소음 체감 양호", score: 5 },
      { id: "ci_l2", label: "관리비·공용부 관리 상태 확인", score: 4 },
    ],
    facility: [{ id: "c_l3", label: "보육·돌봄·마트 생활권 도보권", score: 5 }],
    future: [{ id: "c_l4", label: "학교·공원 신설·정비 계획", score: 4 }],
  },
  투자: {
    future: [
      { id: "c_i1", label: "재건축·재개발·GTX 등 개발 모멘텀", score: 8 },
      { id: "c_i2", label: "공급·분양 물량·입주 물량 영향", score: 6 },
    ],
    complex: [{ id: "c_i3", label: "전세가율·갭·임대수요 양호", score: 7 }],
    location: [{ id: "c_i4", label: "업무지구·대중교통 수요 견인", score: 5 }],
  },
  전월세: {
    interior: [
      { id: "ci_r1", label: "옵션·하자·누수·곰팡이 없음", score: 6 },
      { id: "ci_r2", label: "보증금·관리비·주차 조건 합리", score: 5 },
    ],
    facility: [{ id: "c_r3", label: "역·마트·병원 생활권 접근", score: 5 }],
    location: [{ id: "c_r4", label: "통근·통학 동선 실용적", score: 4 }],
  },
};

/** intent별 추가 항목을 병합한 체크리스트 그룹 */
export function getChecklistForIntent(intent: InspectionChecklistIntent): ChecklistGroupDef[] {
  const extras = INTENT_EXTRA_ITEMS[intent] ?? {};
  return CHECKLIST_GROUPS.map((g) => {
    const extra = extras[g.id];
    if (!extra?.length) return g;
    return { ...g, items: [...g.items, ...extra] };
  });
}

const INTENTS: InspectionChecklistIntent[] = ["실거주", "투자", "전월세"];

/** intent 기본 항목 + 사용자 커스텀 항목을 그룹별로 병합 */
export function getChecklistGroupsWithCustom(
  intent: InspectionChecklistIntent,
  custom: Record<string, ChecklistItemDef[]> = {},
): ChecklistGroupDef[] {
  return getChecklistForIntent(intent).map((g) => {
    const extra = custom[g.id];
    if (!extra?.length) return g;
    return { ...g, items: [...g.items, ...extra] };
  });
}

/**
 * 모든 intent 기본 항목 + 커스텀 항목을 중복 없이 펼친 목록.
 * 저장된 라벨 → id 복원(restore)처럼 현재 intent와 무관하게
 * 가능한 모든 항목을 인식해야 할 때 사용한다.
 */
export function allKnownChecklistItems(
  custom: Record<string, ChecklistItemDef[]> = {},
): ChecklistItemDef[] {
  const seen = new Set<string>();
  const out: ChecklistItemDef[] = [];
  const push = (it: ChecklistItemDef) => {
    if (seen.has(it.id)) return;
    seen.add(it.id);
    out.push(it);
  };
  for (const g of CHECKLIST_GROUPS) g.items.forEach(push);
  for (const intent of INTENTS) {
    for (const g of getChecklistForIntent(intent)) g.items.forEach(push);
  }
  for (const arr of Object.values(custom)) (arr ?? []).forEach(push);
  return out;
}

/** 임장노트 5축 키. `personal-score.ts`의 FiveAxis 와 동일. */
export type AxisKey = "location" | "school" | "transport" | "facility" | "future";

/**
 * 각 5축이 어떤 체크리스트 그룹에서 근거(완료율)를 가져오는지 정의.
 * - location/transport 는 "입지·교통" 그룹을 공유한다(전용 교통 그룹이 없음).
 * - facility 는 생활편의 + 단지·시설 + 내부구조 상태를 포괄한다.
 * "평가(별점) ↔ 체크리스트"를 한 묶음으로 연결하는 단일 소스.
 */
export const AXIS_TO_CHECKLIST_GROUPS: Record<AxisKey, string[]> = {
  location: ["location"],
  transport: ["location"],
  school: ["school"],
  facility: ["facility", "complex", "interior"],
  future: ["future"],
};

/** 그룹 → 대표 축(헤더 태그·요약용). */
export const CHECKLIST_GROUP_TO_AXIS: Record<string, AxisKey> = {
  location: "location",
  complex: "facility",
  interior: "facility",
  school: "school",
  facility: "facility",
  future: "future",
};

const AXIS_LABEL: Record<AxisKey, string> = {
  location: "입지",
  school: "학군",
  transport: "교통",
  facility: "편의시설",
  future: "미래가치",
};

/** 그룹 id 에 대응하는 축 라벨(예: "입지"). 헤더 태그용. */
export function axisLabelForGroup(groupId: string): string | null {
  const axis = CHECKLIST_GROUP_TO_AXIS[groupId];
  return axis ? AXIS_LABEL[axis] : null;
}

export type AxisCompletion = { done: number; total: number; ratio: number };

/**
 * 축별 체크리스트 완료 현황(항목 개수 기준). 별점 자동 제안·축별 진행률 막대에 사용.
 * `groups` 는 화면과 동일한 intent/커스텀 반영 그룹을 넘긴다.
 */
export function axisChecklistCompletion(
  checked: Record<string, boolean>,
  groups: ChecklistGroupDef[] = CHECKLIST_GROUPS,
): Record<AxisKey, AxisCompletion> {
  const byGroupId = new Map(groups.map((g) => [g.id, g] as const));
  const out = {} as Record<AxisKey, AxisCompletion>;
  (Object.keys(AXIS_TO_CHECKLIST_GROUPS) as AxisKey[]).forEach((axis) => {
    let done = 0;
    let total = 0;
    for (const gid of AXIS_TO_CHECKLIST_GROUPS[axis]) {
      const g = byGroupId.get(gid);
      if (!g) continue;
      for (const it of g.items) {
        total += 1;
        if (checked[it.id]) done += 1;
      }
    }
    out[axis] = { done, total, ratio: total > 0 ? done / total : 0 };
  });
  return out;
}

/**
 * 체크리스트 완료율 → 5축 별점(0~5) 자동 산출.
 * 사용자가 "체크리스트로 별점 자동 채우기"를 누르면 적용된다.
 */
export function deriveAxisScoresFromChecklist(
  checked: Record<string, boolean>,
  groups: ChecklistGroupDef[] = CHECKLIST_GROUPS,
): Record<AxisKey, number> {
  const completion = axisChecklistCompletion(checked, groups);
  return {
    location: Math.round(completion.location.ratio * 5),
    school: Math.round(completion.school.ratio * 5),
    transport: Math.round(completion.transport.ratio * 5),
    facility: Math.round(completion.facility.ratio * 5),
    future: Math.round(completion.future.ratio * 5),
  };
}

/**
 * 체크 점수 집계. `groups`를 넘기면 intent 추가 항목·커스텀 항목까지
 * 반영해 화면 체크리스트와 일치한다(기본값은 표준 그룹).
 */
export function computeChecklistScore(
  checked: Record<string, boolean>,
  groups: ChecklistGroupDef[] = CHECKLIST_GROUPS,
): {
  total: number;
  max: number;
  byGroup: Record<string, { total: number; max: number }>;
} {
  const byGroup: Record<string, { total: number; max: number }> = {};
  let total = 0;
  let max = 0;
  for (const g of groups) {
    let gTotal = 0;
    let gMax = 0;
    for (const it of g.items) {
      gMax += it.score;
      if (checked[it.id]) gTotal += it.score;
    }
    byGroup[g.id] = { total: gTotal, max: gMax };
    total += gTotal;
    max += gMax;
  }
  return { total, max, byGroup };
}
