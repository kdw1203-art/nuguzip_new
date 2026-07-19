/**
 * 게이미피케이션 저장소.
 * - 누적 XP / 레벨
 * - 마지막 사용일 → 연속일수 streak 자동 계산
 * - 일일 미션 (하루 1개, 자정 리셋)
 * - 칭호 부여 / 획득한 배지 목록
 *
 * 저장 키: `woodong:gamification:v2`
 */

const KEY = "woodong:gamification:v2";

export type GamificationState = {
  xp: number;
  /** 마지막 활동 날짜 ISO */
  lastActiveDate: string | null;
  /** 연속 출석일 */
  streak: number;
  /** 오늘 사용한 미션 식별자(중복 보상 방지) */
  todayMissionId: string | null;
  /** 미션 완료 날짜 ISO */
  todayMissionDoneOn: string | null;
  /** 누적 임장노트 작성 수 */
  notesCreated: number;
  /** 누적 AI 분석 횟수 */
  aiRuns: number;
  /** 최고 점수 */
  bestScore: number;
  /** 획득한 배지 ID 목록 */
  badges: string[];
};

export const DEFAULT_GAME: GamificationState = {
  xp: 0,
  lastActiveDate: null,
  streak: 0,
  todayMissionId: null,
  todayMissionDoneOn: null,
  notesCreated: 0,
  aiRuns: 0,
  bestScore: 0,
  badges: [],
};

export function readGame(): GamificationState {
  if (typeof window === "undefined") return { ...DEFAULT_GAME };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_GAME };
    const p = JSON.parse(raw) as Partial<GamificationState>;
    return {
      ...DEFAULT_GAME,
      ...p,
      badges: Array.isArray(p.badges) ? p.badges : [],
    };
  } catch {
    return { ...DEFAULT_GAME };
  }
}

export function writeGame(next: GamificationState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("woodong:gamification"));
  } catch {
    /* ignore */
  }
}

/**
 * 레벨 정의 — XP 누계로 산출. 10단계 동네지킴이 시스템.
 * LV1: 0~99, LV2: 100~249, LV3: 250~499, LV4: 500~899, LV5: 900~1399,
 * LV6: 1400~1999, LV7: 2000~2799, LV8: 2800~3799, LV9: 3800~4999, LV10: 5000+
 */
const XP_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000];

export const LEVEL_TITLES = [
  "이웃 새내기",
  "동네 산책러",
  "임장 입문자",
  "안목 있는 임장러",
  "데이터 임장러",
  "지역 분석가",
  "단지 감별사",
  "동네 전문가",
  "지역 마스터",
  "동네지킴이 마스터",
];

export function levelFromXp(xp: number): {
  level: number;
  title: string;
  current: number;
  next: number;
  progress: number;
} {
  let lv = 1;
  for (let i = 0; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) lv = i + 1;
  }
  const lo = XP_THRESHOLDS[lv - 1] ?? 0;
  const hi = XP_THRESHOLDS[lv] ?? lo + 1000;
  const denom = Math.max(1, hi - lo);
  const progress = Math.max(0, Math.min(1, (xp - lo) / denom));
  return {
    level: lv,
    title: LEVEL_TITLES[lv - 1] ?? `LV${lv}`,
    current: xp - lo,
    next: hi - lo,
    progress,
  };
}

/** 점수 칭호 */
export function scoreTitle(score: number): { title: string; emoji: string; tone: string } {
  if (score >= 95) return { title: "공인중개사도 모르는 명당", emoji: "🏆", tone: "from-amber-400 to-yellow-500" };
  if (score >= 90) return { title: "동네 명당", emoji: "💎", tone: "from-violet-500 to-fuchsia-500" };
  if (score >= 85) return { title: "안목 있는 단지", emoji: "✨", tone: "from-emerald-500 to-teal-500" };
  if (score >= 75) return { title: "안정적인 선택", emoji: "👍", tone: "from-blue-500 to-cyan-500" };
  if (score >= 65) return { title: "검토할 만한 동네", emoji: "🔍", tone: "from-sky-500 to-blue-500" };
  if (score >= 50) return { title: "더 비교 필요", emoji: "🤔", tone: "from-slate-500 to-slate-700" };
  return { title: "신중한 접근 권장", emoji: "⚠️", tone: "from-orange-500 to-rose-500" };
}

function dateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function diffInDays(aIso: string, bIso: string): number {
  const a = new Date(aIso + "T00:00:00").getTime();
  const b = new Date(bIso + "T00:00:00").getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * 활동을 기록하고 streak/XP/배지를 갱신합니다.
 * 반환값에 새로 획득한 배지·레벨업 여부가 포함됩니다.
 */
export function recordActivity(input: {
  /** 활동 종류: "ai" | "note" | "general" */
  kind: "ai" | "note" | "general";
  /** 추가 XP */
  xpDelta: number;
  /** 분석 점수 (있을 때 최고점·90+ 배지 갱신) */
  score?: number;
  /** 미션 완료 식별자 */
  missionId?: string | null;
}): {
  state: GamificationState;
  leveledUp: boolean;
  newBadges: string[];
} {
  const cur = readGame();
  const today = dateKey();
  const newBadges: string[] = [];

  let nextStreak = cur.streak;
  if (cur.lastActiveDate === null) nextStreak = 1;
  else if (cur.lastActiveDate === today) {
    /* 같은 날 추가 활동 → streak 유지 */
  } else {
    const gap = diffInDays(cur.lastActiveDate, today);
    if (gap === 1) nextStreak = cur.streak + 1;
    else nextStreak = 1; // 끊김
  }

  const beforeLv = levelFromXp(cur.xp).level;
  const xp = cur.xp + Math.max(0, Math.round(input.xpDelta));
  const afterLv = levelFromXp(xp).level;
  const leveledUp = afterLv > beforeLv;

  const next: GamificationState = {
    ...cur,
    xp,
    lastActiveDate: today,
    streak: nextStreak,
    notesCreated: cur.notesCreated + (input.kind === "note" ? 1 : 0),
    aiRuns: cur.aiRuns + (input.kind === "ai" ? 1 : 0),
    bestScore: typeof input.score === "number" ? Math.max(cur.bestScore, input.score) : cur.bestScore,
    todayMissionId: input.missionId ?? cur.todayMissionId,
    todayMissionDoneOn: input.missionId ? today : cur.todayMissionDoneOn,
  };

  // 배지 평가
  const award = (id: string) => {
    if (!next.badges.includes(id)) {
      next.badges.push(id);
      newBadges.push(id);
    }
  };
  if (next.aiRuns >= 1) award("first-ai");
  if (next.aiRuns >= 5) award("ai-5x");
  if (next.aiRuns >= 20) award("ai-20x");
  if (next.notesCreated >= 1) award("first-note");
  if (next.notesCreated >= 10) award("note-10x");
  if (typeof input.score === "number") {
    if (input.score >= 80) award("score-80");
    if (input.score >= 90) award("score-90");
    if (input.score >= 95) award("score-95");
  }
  if (next.streak >= 3) award("streak-3");
  if (next.streak >= 7) award("streak-7");
  if (next.streak >= 30) award("streak-30");
  if (leveledUp) award(`lv-${afterLv}`);

  writeGame(next);
  return { state: next, leveledUp, newBadges };
}

/** 미션 정의 — 매일 8시간 단위 회전 */
export type MissionDef = {
  id: string;
  title: string;
  description: string;
  ctaHref: string;
  ctaLabel: string;
  rewardXp: number;
  emoji: string;
};

export const MISSION_POOL: MissionDef[] = [
  {
    id: "compare-3",
    title: "3개 단지 비교 분석",
    description: "관심 있는 단지 3곳을 한 번에 비교해보세요.",
    ctaHref: "/ai-analysis/ai-compare",
    ctaLabel: "AI 비교 시작",
    rewardXp: 50,
    emoji: "⚖️",
  },
  {
    id: "first-note-today",
    title: "임장 노트 한 편 작성",
    description: "오늘 본 동네 한 곳을 5분 임장노트로 남겨봐요.",
    ctaHref: "/inspection/create",
    ctaLabel: "임장 노트 작성",
    rewardXp: 60,
    emoji: "📝",
  },
  {
    id: "ai-timing",
    title: "AI 매수 타이밍 진단",
    description: "지금이 매수 타이밍인지 AI에게 물어봐요.",
    ctaHref: "/ai-analysis/ai-timing",
    ctaLabel: "타이밍 진단",
    rewardXp: 40,
    emoji: "⏱️",
  },
  {
    id: "ai-risk",
    title: "리스크 점검",
    description: "관심 단지의 리스크 요인을 한 번 점검해보세요.",
    ctaHref: "/ai-analysis/ai-risk",
    ctaLabel: "리스크 분석",
    rewardXp: 40,
    emoji: "🛡️",
  },
  {
    id: "watchlist-check",
    title: "관심 단지 점수 갱신",
    description: "위시리스트 단지의 최신 점수를 확인해봐요.",
    ctaHref: "/me",
    ctaLabel: "위시리스트 보기",
    rewardXp: 30,
    emoji: "⭐",
  },
  {
    id: "share-result",
    title: "이웃과 결과 공유",
    description: "분석 결과를 이미지·링크로 공유해보세요.",
    ctaHref: "/ai-analysis",
    ctaLabel: "분석 결과 보기",
    rewardXp: 35,
    emoji: "🔗",
  },
  {
    id: "checklist-30",
    title: "체크리스트 30개 채우기",
    description: "임장노트 작성 시 체크 항목 30개 이상 채워봐요.",
    ctaHref: "/inspection/create",
    ctaLabel: "체크리스트 채우기",
    rewardXp: 55,
    emoji: "✅",
  },
];

/** 오늘의 미션 1개를 결정 — 같은 날에는 항상 같은 결과 (날짜 + 누적 XP 기반 해시) */
export function todayMission(): MissionDef {
  const game = readGame();
  // 같은 날에는 동일 미션을 반환하되, 완료 후에도 표시는 유지
  const day = dateKey();
  // 단순 해시: 날짜 문자열 char 합 + xp/100
  let h = 0;
  for (let i = 0; i < day.length; i++) h += day.charCodeAt(i);
  h += Math.floor(game.xp / 100);
  return MISSION_POOL[h % MISSION_POOL.length];
}

/** 오늘 미션이 완료되었는지 */
export function isTodayMissionDone(): boolean {
  const g = readGame();
  if (!g.todayMissionDoneOn) return false;
  return g.todayMissionDoneOn === dateKey();
}

export const BADGE_LABELS: Record<string, { label: string; emoji: string }> = {
  "first-ai": { label: "AI 첫 분석", emoji: "🤖" },
  "ai-5x": { label: "AI 5회 사용", emoji: "🧠" },
  "ai-20x": { label: "AI 마스터", emoji: "🎯" },
  "first-note": { label: "임장노트 첫 작성", emoji: "📓" },
  "note-10x": { label: "임장 베테랑", emoji: "🥇" },
  "score-80": { label: "80점 달성", emoji: "✨" },
  "score-90": { label: "90점 달성", emoji: "💎" },
  "score-95": { label: "95점 달성", emoji: "🏆" },
  "streak-3": { label: "3일 연속", emoji: "🔥" },
  "streak-7": { label: "1주일 연속", emoji: "🌟" },
  "streak-30": { label: "한 달 연속", emoji: "👑" },
};
