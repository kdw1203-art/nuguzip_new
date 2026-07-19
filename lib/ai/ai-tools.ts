/** AI 분석 워크벤치·동적 라우트에서 공통으로 쓰는 도구 ID */

export const AI_TOOL_IDS = [
  "ai-diagnosis",
  "ai-prediction",
  "ai-risk",
  "ai-compare",
  "ai-inspection",
  "my-checklist",
  "ai-portfolio",
  "ai-timing",
  "ai-simulator",
  "ai-gap",
  "ai-economy",
  "contract-risk",
] as const;

/** 데스크톱 통합 4기능 노출용 */
export const CORE_AI_TOOL_IDS = [
  "ai-diagnosis",
  "ai-prediction",
  "ai-inspection",
  "ai-timing",
] as const;

/**
 * 핵심 4기능 + 추가 5기능 = 통합 9개.
 * Hero/Digest/InputOptions UX 패턴이 적용되는 전체 도구 집합.
 */
export const EXTENDED_AI_TOOL_IDS = [
  ...CORE_AI_TOOL_IDS,
  "ai-risk",
  "ai-compare",
  "ai-simulator",
  "ai-gap",
  "ai-economy",
] as const;

export type AiAnalysisToolId = (typeof AI_TOOL_IDS)[number];

export type CoreAiAnalysisToolId = (typeof CORE_AI_TOOL_IDS)[number];

export type ExtendedAiAnalysisToolId = (typeof EXTENDED_AI_TOOL_IDS)[number];

const SET = new Set<string>(AI_TOOL_IDS);
const EXTENDED_SET = new Set<string>(EXTENDED_AI_TOOL_IDS);

/** `Array.prototype.includes` 타입이 튜플에서 과도하게 좁혀져 도구 전체 union과 맞지 않을 때 사용 */
export function isCoreAiAnalysisToolId(id: AiAnalysisToolId): id is CoreAiAnalysisToolId {
  return (CORE_AI_TOOL_IDS as readonly string[]).includes(id);
}

/** Hero/Digest/InputOptions 패턴이 적용되는 9종 인지 검사. */
export function isExtendedAiAnalysisToolId(
  id: AiAnalysisToolId,
): id is ExtendedAiAnalysisToolId {
  return EXTENDED_SET.has(id);
}

export function isAiAnalysisToolId(v: string): v is AiAnalysisToolId {
  return SET.has(v);
}
