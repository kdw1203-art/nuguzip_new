/**
 * history-store — 사용자가 실행한 AI 분석을 localStorage 에 저장/조회.
 *
 * 같은 도구·같은 지역(또는 단지) 키로 직전 점수와 비교해 "▲/▼ N점" 비교 칩을 만들어줍니다.
 *
 * 저장 한도: 도구 × 키 조합당 최대 8개 (오래된 항목부터 제거).
 */

const KEY = "woodong:ai-history:v1";

export type HistoryEntry = {
  /** 도구 ID */
  tool: string;
  /** 비교 그룹 키 — 같은 키끼리 시간 비교 (예: "ai-diagnosis:강남구:역삼동") */
  groupKey: string;
  score: number | null;
  headline?: string | null;
  oneLine?: string | null;
  createdAt: string;
};

type Store = Record<string, HistoryEntry[]>;

const MAX_PER_GROUP = 8;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

function write(s: Store): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore quota
  }
}

export function pushHistory(entry: HistoryEntry): void {
  const s = read();
  const k = `${entry.tool}::${entry.groupKey}`;
  const list = s[k] ?? [];
  list.unshift(entry);
  s[k] = list.slice(0, MAX_PER_GROUP);
  write(s);
}

/** groupKey 기준 가장 최근 N개 (현재 항목 포함) */
export function listHistory(tool: string, groupKey: string): HistoryEntry[] {
  const s = read();
  return s[`${tool}::${groupKey}`] ?? [];
}

/**
 * 직전 항목과 비교해 "▲ 5점 (어제 대비)" 같은 비교 칩 정보를 반환.
 * 직전 기록이 없거나 점수가 같으면 null 반환.
 */
export function pickHistoryCompareChip(
  tool: string,
  groupKey: string,
  currentScore: number | null,
): { label: string; tone: "up" | "down" | "flat"; hint: string } | null {
  if (currentScore == null) return null;
  const entries = listHistory(tool, groupKey);
  // 첫 항목은 방금 기록한 현재일 수 있어 두 번째를 사용
  const prev = entries.find((e) => e.score != null && e.createdAt !== entries[0]?.createdAt);
  if (!prev || prev.score == null) return null;
  const diff = currentScore - prev.score;
  const tone: "up" | "down" | "flat" = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const days = Math.max(
    1,
    Math.round((Date.now() - new Date(prev.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
  );
  return {
    label:
      diff === 0
        ? `이전과 동일한 ${currentScore}점 (${days}일 전 대비)`
        : `${tone === "up" ? "▲" : "▼"} ${Math.abs(diff)}점 (${days}일 전 ${prev.score}점 대비)`,
    tone,
    hint: `이전 분석은 ${prev.score}점 / ${new Date(prev.createdAt).toLocaleDateString("ko-KR")}`,
  };
}

/** 도구별 group key 생성 헬퍼 (도구마다 식별자가 다름) */
export function buildGroupKey(tool: string, identifiers: Array<string | undefined | null>): string {
  const parts = identifiers.filter(Boolean).map((s) => String(s).trim()).filter((s) => s.length > 0);
  return parts.length === 0 ? tool : parts.join(":");
}
