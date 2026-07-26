/**
 * AI Hero "다음에 할 일" 자동 라우팅 — 도구별로 다음 권장 도구·라우트를 결정.
 *
 * ⚠️ 2026-07-26 확인: 이 모듈을 import 하는 곳이 저장소에 하나도 없다. 위 주석이
 * 사용처로 적어 둔 components/ai/ai-result-hero-card.tsx 는 지금 존재하지 않는다
 * (components/ai 디렉터리 자체가 없다). 즉 여기 href 는 화면에 나오지 않는다.
 * 그래도 경로는 실존하는 것으로 맞춰 둔다 — `/ai-analysis/{tool}` 은 라우트가
 * 아니라 분석 엔진의 툴 식별자라서, 연결하는 순간 전부 404 가 되기 때문이다.
 * 툴별 페이지는 없고 실존하는 건 분석 허브 /analysis 다.
 *
 * 라우팅 우선순위:
 *   1) 점수가 매우 낮으면 → 위험(ai-risk) 또는 임장(ai-inspection) 으로
 *   2) 점수가 매우 높으면 → 매수 타이밍(ai-timing) 또는 시뮬레이터(ai-simulator)
 *   3) 그 외엔 도구별 자연스러운 다음 단계 매핑.
 */

import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";

export type NextActionTarget = {
  /** 사용자에게 보여줄 짧은 라벨 */
  label: string;
  /** 클릭 시 이동할 next.js path (?ref= 등 포함 가능) */
  href: string;
  /** 작은 안내 한 줄 */
  hint?: string;
  /** 이모지 */
  emoji?: string;
};

const DEFAULT_NEXT: Record<AiAnalysisToolId, NextActionTarget> = {
  "ai-diagnosis": {
    label: "임장 가서 직접 보기",
    href: "/analysis",
    emoji: "🏃",
    hint: "AI 진단 결과를 바탕으로 우선 임장 후보를 추천해 드려요.",
  },
  "ai-prediction": {
    label: "지금 사기 좋은 타이밍인지 확인",
    href: "/analysis",
    emoji: "⏱️",
    hint: "예측한 흐름을 바탕으로 매수 타이밍을 점검해 보세요.",
  },
  "ai-inspection": {
    label: "임장 노트 바로 작성",
    href: "/notes/new",
    emoji: "📝",
    hint: "AI가 짚은 체크 포인트를 노트에 미리 채워드려요.",
  },
  "ai-timing": {
    label: "리스크 한 번 더 점검",
    href: "/analysis",
    emoji: "🛡️",
    hint: "타이밍이 좋아도 위험은 따로 살펴보는 게 안전해요.",
  },
  "ai-risk": {
    label: "비슷한 안전한 후보 찾기",
    href: "/analysis",
    emoji: "🔁",
    hint: "다른 후보와 위험·기회를 함께 비교해 봐요.",
  },
  "ai-compare": {
    label: "후보 단지 임장 가기",
    href: "/analysis",
    emoji: "🚇",
    hint: "두 후보 모두 임장으로 검증하면 결정이 쉬워져요.",
  },
  "ai-simulator": {
    label: "현금 흐름이 더 좋은 타이밍 찾기",
    href: "/analysis",
    emoji: "📈",
    hint: "시나리오가 흔들리면 타이밍을 다시 점검해야 해요.",
  },
  "ai-gap": {
    label: "위험을 함께 점검",
    href: "/analysis",
    emoji: "🛡️",
    hint: "갭 투자는 역전세 위험과 함께 봐야 해요.",
  },
  "ai-economy": {
    label: "관심 단지 시세 예측",
    href: "/analysis",
    emoji: "📊",
    hint: "거시 흐름을 바탕으로 단지 단위 예측을 이어가세요.",
  },
  "my-checklist": {
    label: "임장 노트로 옮기기",
    href: "/notes/new",
    emoji: "📝",
  },
  "ai-portfolio": {
    label: "포트폴리오 시뮬레이션",
    href: "/analysis",
    emoji: "🧮",
  },
  "contract-risk": {
    label: "전문가에게 한 번 물어보기",
    href: "/town/experts",
    emoji: "🎓",
  },
};

const LOW_SCORE_NEXT: NextActionTarget = {
  label: "우선 위험 점검",
  href: "/analysis",
  emoji: "🛡️",
  hint: "점수가 낮을 땐 위험을 먼저 좁혀봐요.",
};

const HIGH_SCORE_NEXT: NextActionTarget = {
  label: "지금 매수 타이밍 점검",
  href: "/analysis",
  emoji: "⏱️",
  hint: "점수가 높으면 매수 타이밍 검증이 우선이에요.",
};

/**
 * 점수와 도구 종류를 함께 고려해서 다음 행동을 결정한다.
 *
 * @param tool 현재 도구 ID
 * @param score 0~100 점수 (없으면 기본 매핑 사용)
 */
export function pickNextAction(
  tool: AiAnalysisToolId,
  score: number | null,
): NextActionTarget {
  if (typeof score === "number" && Number.isFinite(score)) {
    if (score < 35 && tool !== "ai-risk") return LOW_SCORE_NEXT;
    if (score >= 80 && tool !== "ai-timing") return HIGH_SCORE_NEXT;
  }
  return DEFAULT_NEXT[tool] ?? DEFAULT_NEXT["ai-diagnosis"];
}

/**
 * Hero 의 recommendation 텍스트만 보고 "다음 행동" 으로 사용할 수 있는지 휴리스틱.
 * (현재는 항상 true — 미래에 빈 텍스트일 때 false 등으로 확장)
 */
export function shouldShowNextAction(_recommendation: string | null): boolean {
  return true;
}
