/**
 * score-recalc — What-If 슬라이더가 변동하는 변수에 따라 AI 점수를 재계산하는 단순 휴리스틱.
 *
 * 정밀하지 않으며, 사용자에게 "변수가 흔들리면 점수가 어떻게 변할까?" 를
 * 직관적으로 보여주기 위한 시뮬레이션입니다. 외부 LLM을 호출하지 않고
 * 내부 규칙(가중치)만 사용합니다.
 */

export type WhatIfFactor = "price" | "rate" | "supply";

export type WhatIfDeltas = {
  /** 시세 변동 (-30% ~ +30%) */
  price?: number;
  /** 금리 변동 (-3.0%p ~ +3.0%p) */
  rate?: number;
  /** 공급 변동 (-30% ~ +30%) — 입주물량/공실 */
  supply?: number;
};

export const WHATIF_FACTORS: Array<{
  id: WhatIfFactor;
  label: string;
  emoji: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  weight: number; // 점수에 미치는 가중치 (절댓값)
  /** delta>0 일 때 점수에 +/- 어느 방향인지 */
  positiveDirection: 1 | -1;
  hint: string;
}> = [
  {
    id: "price",
    label: "현재 시세",
    emoji: "🏷️",
    unit: "%",
    min: -30,
    max: 30,
    step: 1,
    weight: 0.6,
    positiveDirection: -1, // 시세 ↑ → 매력도 ↓
    hint: "현재 시세가 더 비싸지면 점수가 낮아져요.",
  },
  {
    id: "rate",
    label: "주담대 금리",
    emoji: "🏦",
    unit: "%p",
    min: -3,
    max: 3,
    step: 0.1,
    weight: 4,
    positiveDirection: -1, // 금리 ↑ → 매력도 ↓
    hint: "금리가 오르면 자금 부담이 커져 점수가 내려가요.",
  },
  {
    id: "supply",
    label: "입주 물량 (공급)",
    emoji: "🏗",
    unit: "%",
    min: -30,
    max: 30,
    step: 1,
    weight: 0.4,
    positiveDirection: -1, // 공급 ↑ → 시세 약세 → 매력도 ↓
    hint: "공급이 늘면 가격 부담이 줄지만 시세가 약해질 수 있어요.",
  },
];

/**
 * 기준 점수에서 What-If 변수 변화에 따라 새 점수를 추정.
 * 결과는 0~100 범위로 클램프.
 */
export function recalculateScore(baseScore: number, deltas: WhatIfDeltas): number {
  let s = baseScore;
  for (const f of WHATIF_FACTORS) {
    const d = deltas[f.id] ?? 0;
    if (d === 0) continue;
    s += d * f.weight * f.positiveDirection;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

/**
 * 슬라이더 변동의 한 줄 설명을 만든다 (UI 텍스트용).
 */
export function describeDeltas(deltas: WhatIfDeltas): string {
  const parts: string[] = [];
  for (const f of WHATIF_FACTORS) {
    const d = deltas[f.id];
    if (!d) continue;
    const sign = d > 0 ? "+" : "";
    parts.push(`${f.label} ${sign}${d}${f.unit}`);
  }
  if (parts.length === 0) return "변수 그대로";
  return parts.join(" · ");
}
