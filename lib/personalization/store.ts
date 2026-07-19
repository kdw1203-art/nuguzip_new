/**
 * 개인화 저장소 (localStorage 기반).
 *
 * - 페르소나(투자 성향) 카드 선택
 * - 4축 우선순위 가중치 (학군 / 교통 / 가격 / 미래가치)
 * - 자주 쓰는 AI 도구 입력 기본값 (모델, 정밀도, 마지막 칩 등)
 * - 즐겨찾는 체크리스트 항목 ★
 * - 사용자가 직접 추가한 체크리스트 항목
 * - 임장노트 커버 컬러 테마
 * - 사운드 효과 사용 여부
 *
 * SSR 안전 — typeof window 가드 + try/catch 로 권한 거부도 흡수합니다.
 */

export type PersonaId =
  | "live"
  | "long-term"
  | "flip"
  | "newlywed"
  | "retire";

export type PriorityWeights = {
  /** 학군 / 교육환경 */
  school: number;
  /** 교통 / 입지 */
  transport: number;
  /** 가격 / 자금조달 부담 */
  price: number;
  /** 미래가치 / 호재 */
  future: number;
};

export const DEFAULT_PRIORITIES: PriorityWeights = {
  school: 50,
  transport: 50,
  price: 50,
  future: 50,
};

export const PERSONA_PRIORITY_PRESET: Record<PersonaId, PriorityWeights> = {
  live: { school: 70, transport: 65, price: 55, future: 40 },
  "long-term": { school: 45, transport: 60, price: 50, future: 80 },
  flip: { school: 25, transport: 60, price: 75, future: 70 },
  newlywed: { school: 65, transport: 70, price: 70, future: 45 },
  retire: { school: 30, transport: 55, price: 60, future: 35 },
};

export type CoverColorId = "blue" | "rose" | "green" | "violet" | "amber" | "slate";

export const COVER_COLOR_TOKENS: Record<
  CoverColorId,
  { from: string; to: string; ring: string; chip: string; label: string; emoji: string }
> = {
  blue: { from: "from-sky-500", to: "to-blue-600", ring: "ring-blue-200", chip: "bg-blue-50 text-blue-700", label: "오션", emoji: "🌊" },
  rose: { from: "from-rose-500", to: "to-pink-600", ring: "ring-rose-200", chip: "bg-rose-50 text-rose-700", label: "체리", emoji: "🌸" },
  green: { from: "from-emerald-500", to: "to-teal-600", ring: "ring-emerald-200", chip: "bg-emerald-50 text-emerald-700", label: "포레스트", emoji: "🌿" },
  violet: { from: "from-violet-500", to: "to-purple-600", ring: "ring-violet-200", chip: "bg-violet-50 text-violet-700", label: "라일락", emoji: "💜" },
  amber: { from: "from-amber-500", to: "to-orange-600", ring: "ring-amber-200", chip: "bg-amber-50 text-amber-700", label: "선셋", emoji: "🌅" },
  slate: { from: "from-slate-700", to: "to-slate-900", ring: "ring-slate-200", chip: "bg-slate-100 text-slate-700", label: "미니멀", emoji: "🪨" },
};

export type PersonaProfile = {
  persona: PersonaId | null;
  priorities: PriorityWeights;
  /** 보유 의향 연수 */
  holdingYears: number;
  /** 1~5 위험 감내 수준 */
  riskTolerance: number;
  /** 임장노트 커버 컬러 */
  coverColor: CoverColorId;
  /** 분석 완료 사운드 */
  soundEnabled: boolean;
  /** AI 도구별 마지막 입력 캐시 */
  aiToolDefaults: Record<string, Record<string, string | number | boolean | null>>;
  /** 즐겨찾는 체크리스트 항목 id */
  favoriteCheckIds: string[];
  /** 사용자가 그룹별로 추가한 체크리스트 항목 */
  customChecklist: Record<string, Array<{ id: string; label: string; score: number }>>;
};

export const PERSONA_LABELS: Record<PersonaId, { title: string; tagline: string; emoji: string; gradient: string }> = {
  live: {
    title: "실거주 우선",
    tagline: "내가 살 집부터 똑똑하게",
    emoji: "🏠",
    gradient: "from-sky-500 to-blue-600",
  },
  "long-term": {
    title: "장기 투자",
    tagline: "10년 뒤를 보는 안목",
    emoji: "📈",
    gradient: "from-emerald-500 to-teal-600",
  },
  flip: {
    title: "단타·갭투자",
    tagline: "흐름을 빠르게 잡는다",
    emoji: "⚡",
    gradient: "from-amber-500 to-orange-600",
  },
  newlywed: {
    title: "신혼·자녀",
    tagline: "학군과 동선이 핵심",
    emoji: "👨‍👩‍👧",
    gradient: "from-rose-500 to-pink-600",
  },
  retire: {
    title: "은퇴·자산관리",
    tagline: "안정적인 인컴이 우선",
    emoji: "🌿",
    gradient: "from-slate-600 to-slate-800",
  },
};

const KEY = "woodong:persona-profile:v2";

export const DEFAULT_PROFILE: PersonaProfile = {
  persona: null,
  priorities: { ...DEFAULT_PRIORITIES },
  holdingYears: 5,
  riskTolerance: 3,
  coverColor: "blue",
  soundEnabled: false,
  aiToolDefaults: {},
  favoriteCheckIds: [],
  customChecklist: {},
};

/** useSyncExternalStore(getSnapshot) 안정화 — 매 호출마다 새 객체를 만들면 React #185 */
let profileSnapshotKey: string | null = null;
let profileSnapshot: PersonaProfile | null = null;
const emptyProfileFallback: PersonaProfile = {
  ...DEFAULT_PROFILE,
  priorities: { ...DEFAULT_PRIORITIES },
};

export function readProfile(): PersonaProfile {
  if (typeof window === "undefined") return emptyProfileFallback;
  try {
    const raw = localStorage.getItem(KEY);
    const key = raw ?? "";
    if (profileSnapshot && profileSnapshotKey === key) return profileSnapshot;
    if (!raw) {
      profileSnapshotKey = key;
      profileSnapshot = emptyProfileFallback;
      return emptyProfileFallback;
    }
    const parsed = JSON.parse(raw) as Partial<PersonaProfile>;
    const merged: PersonaProfile = {
      ...DEFAULT_PROFILE,
      ...parsed,
      priorities: { ...DEFAULT_PRIORITIES, ...(parsed.priorities ?? {}) },
      aiToolDefaults: { ...(parsed.aiToolDefaults ?? {}) },
      favoriteCheckIds: Array.isArray(parsed.favoriteCheckIds) ? parsed.favoriteCheckIds : [],
      customChecklist: { ...(parsed.customChecklist ?? {}) },
    };
    profileSnapshotKey = key;
    profileSnapshot = merged;
    return merged;
  } catch {
    profileSnapshotKey = "!err";
    profileSnapshot = emptyProfileFallback;
    return emptyProfileFallback;
  }
}

export function writeProfile(next: PersonaProfile): void {
  if (typeof window === "undefined") return;
  profileSnapshotKey = null;
  profileSnapshot = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("woodong:persona-profile"));
  } catch {
    /* 권한 거부 */
  }
}

export function patchProfile(patch: Partial<PersonaProfile>): PersonaProfile {
  const cur = readProfile();
  const merged: PersonaProfile = {
    ...cur,
    ...patch,
    priorities: { ...cur.priorities, ...(patch.priorities ?? {}) },
    aiToolDefaults: { ...cur.aiToolDefaults, ...(patch.aiToolDefaults ?? {}) },
    customChecklist: { ...cur.customChecklist, ...(patch.customChecklist ?? {}) },
  };
  writeProfile(merged);
  return merged;
}

/** AI 도구별 마지막 사용한 입력값을 저장 (자동 채우기에 사용) */
export function rememberToolInput(
  toolId: string,
  input: Record<string, string | number | boolean | null>,
): void {
  const cur = readProfile();
  const next: PersonaProfile = {
    ...cur,
    aiToolDefaults: {
      ...cur.aiToolDefaults,
      [toolId]: { ...input },
    },
  };
  writeProfile(next);
}

export function recallToolInput(toolId: string): Record<string, string | number | boolean | null> {
  const cur = readProfile();
  return cur.aiToolDefaults[toolId] ?? {};
}

/** ★ 즐겨찾기 토글 */
export function toggleFavoriteCheck(itemId: string): string[] {
  const cur = readProfile();
  const idx = cur.favoriteCheckIds.indexOf(itemId);
  const next = [...cur.favoriteCheckIds];
  if (idx === -1) next.push(itemId);
  else next.splice(idx, 1);
  writeProfile({ ...cur, favoriteCheckIds: next });
  return next;
}

/** 사용자 정의 체크 항목 추가 */
export function addCustomCheckItem(
  groupId: string,
  label: string,
  score: number,
): { id: string; label: string; score: number } {
  const cur = readProfile();
  const newItem = {
    id: `u-${groupId}-${Date.now().toString(36)}`,
    label: label.trim(),
    score: Math.max(1, Math.min(15, Math.round(score))),
  };
  const list = [...(cur.customChecklist[groupId] ?? []), newItem];
  writeProfile({
    ...cur,
    customChecklist: { ...cur.customChecklist, [groupId]: list },
  });
  return newItem;
}

export function removeCustomCheckItem(groupId: string, itemId: string): void {
  const cur = readProfile();
  const list = (cur.customChecklist[groupId] ?? []).filter((it) => it.id !== itemId);
  writeProfile({
    ...cur,
    customChecklist: { ...cur.customChecklist, [groupId]: list },
  });
}

/**
 * 우선순위 가중치를 0~1 범위 비율로 정규화해 반환합니다.
 * 합이 0이면 균등 0.25씩 반환 (기본값 안전판).
 */
export function normalizePriorities(p: PriorityWeights): PriorityWeights {
  const total = p.school + p.transport + p.price + p.future;
  if (total <= 0) return { school: 25, transport: 25, price: 25, future: 25 };
  return p;
}
