/**
 * 지역 임장 레벨 — 사용자가 **실제로 남긴 임장노트**를 구/시 단위로 세어
 * 그 지역의 임장 숙련도를 레벨·배지로 보여 준다. 인센티브 설계의 '지역 전문가
 * 레벨'을 지어낸 수치 없이 실카운트로 구현한 것.
 *
 * 순수 함수(서버 전용 import 없음) — 노트 배열만 받으면 레벨을 낸다. 그래서
 * 유닛 테스트가 가능하고, /my 서버 컴포넌트가 이미 불러온 노트를 그대로 넘긴다.
 *
 * note.region 은 자유 텍스트("서울 강남구")라 그대로 세면 "강남구"와 조각난다 —
 * guToken 으로 구/시 토큰만 뽑아 버킷을 안정화한다(lib/onboarding/personalization
 * 의 guOf 와 같은 규칙, 여기선 순수하게 다시 둔다).
 */

export type RegionLevel = {
  /** 구/시 토큰 (예: "강남구", "성남시") */
  region: string;
  /** 이 지역에 남긴 임장노트 수 */
  count: number;
  /** 1~5 */
  level: number;
  /** 레벨 이름 (배지 라벨) */
  label: string;
  /** 다음 레벨까지 — 최고 레벨이면 null */
  next: { need: number; label: string } | null;
};

/** 레벨 구간 — 오름차순. 지역별 노트 수가 min 이상이면 그 레벨. */
export const REGION_TIERS: { min: number; level: number; label: string }[] = [
  { min: 1, level: 1, label: "새싹 임장러" },
  { min: 3, level: 2, label: "동네 탐험가" },
  { min: 5, level: 3, label: "단골 임장러" },
  { min: 10, level: 4, label: "지역 전문가" },
  { min: 20, level: 5, label: "임장 마스터" },
];

/** 자유 텍스트 지역명 → 구/시 토큰. "서울 강남구" → "강남구", "고양시 덕양구" → "덕양구". */
export function guToken(name: string): string {
  const tokens = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return "";
  const gu = [...tokens].reverse().find((t) => /구$/.test(t));
  if (gu) return gu;
  const si = [...tokens].reverse().find((t) => /시$/.test(t));
  if (si) return si;
  const gun = [...tokens].reverse().find((t) => /군$/.test(t));
  if (gun) return gun;
  return tokens[tokens.length - 1];
}

/** 노트 수 → 해당 구간(레벨·라벨·다음 목표). count<1 이면 null. */
export function tierForCount(
  count: number,
): { level: number; label: string; next: { need: number; label: string } | null } | null {
  if (count < 1) return null;
  let current = REGION_TIERS[0];
  for (const t of REGION_TIERS) {
    if (count >= t.min) current = t;
  }
  const idx = REGION_TIERS.findIndex((t) => t.level === current.level);
  const upper = REGION_TIERS[idx + 1] ?? null;
  return {
    level: current.level,
    label: current.label,
    next: upper ? { need: upper.min - count, label: upper.label } : null,
  };
}

/**
 * 노트 배열 → 지역별 레벨 목록(노트 많은 순). region 이 없는 노트는 버린다.
 * limit 로 상위 N개만(기본 6) — 마이 화면 패널용.
 */
export function computeRegionLevels(
  notes: { region: string }[],
  limit = 6,
): RegionLevel[] {
  const counts = new Map<string, number>();
  for (const n of notes) {
    const key = guToken(n.region);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: RegionLevel[] = [];
  for (const [region, count] of counts) {
    const t = tierForCount(count);
    if (!t) continue;
    out.push({ region, count, level: t.level, label: t.label, next: t.next });
  }
  out.sort((a, b) => b.count - a.count || a.region.localeCompare(b.region, "ko"));
  return out.slice(0, Math.max(0, limit));
}

/**
 * 이 카운트가 **정확히 레벨 경계에 도달한 순간**인가 — 도달했으면 그 구간을 반환.
 * 노트 저장 직후 지급 판정용: 카운트는 저장마다 1씩 오르므로 경계는 정확히 한 번
 * 지나간다(경계가 아니면 null → 지급 없음). refId(지역:레벨) 멱등과 함께 쓴다.
 */
export function tierReachedAt(
  count: number,
): { level: number; label: string } | null {
  const t = REGION_TIERS.find((x) => x.min === count);
  return t ? { level: t.level, label: t.label } : null;
}

/** 현재 레벨 구간 안에서 다음 레벨까지의 진행률(0~100). 최고 레벨이면 100. */
export function regionLevelProgress(r: RegionLevel): number {
  if (!r.next) return 100;
  const currentMin = REGION_TIERS.find((t) => t.level === r.level)?.min ?? 0;
  const nextMin = r.count + r.next.need;
  const span = nextMin - currentMin;
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((r.count - currentMin) / span) * 100)));
}

/** 전체 요약 — 총 임장 지역 수·최고 레벨(마이 헤더 한 줄용). */
export function regionLevelSummary(levels: RegionLevel[]): {
  regionCount: number;
  topLevel: number;
  topLabel: string | null;
} {
  if (levels.length === 0) return { regionCount: 0, topLevel: 0, topLabel: null };
  const top = levels.reduce((a, b) => (b.level > a.level ? b : a));
  return { regionCount: levels.length, topLevel: top.level, topLabel: top.label };
}
