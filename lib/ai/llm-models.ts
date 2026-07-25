/**
 * UI·API에서 선택 가능한 LLM.
 * - OpenAI: GPT 계열 (ChatGPT·Cursor 등에서 동일 API 키로 사용)
 * - Anthropic: Claude Sonnet / Opus
 * "Composer"는 별도 공개 API가 없어 GPT-4o 계열로 안내합니다.
 */

import { getOpenAiApiKey } from "@/lib/ai/env-keys";

export type LlmVendor = "openai" | "anthropic";

/**
 * Anthropic 기본(현행 안정) 모델 ID — 에이전트 루프 등 lib 전역에서 이 상수로
 * 통일해 쓴다. 구세대 ID(claude-3-5-sonnet-20241022 등) 하드코딩 금지.
 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";

export type LlmModelOption = {
  id: string;
  label: string;
  description: string;
  vendor: LlmVendor;
  /** 실제 API에 넘길 모델 문자열 */
  apiModel: string;
};

export const LLM_MODEL_OPTIONS: LlmModelOption[] = [
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    description: "빠르고 경제적 · 기본 추천",
    vendor: "openai",
    apiModel: "gpt-4o-mini",
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    description: "복합 분석·긴 문맥에 유리 (ChatGPT / Composer 백엔드와 동급 계열)",
    vendor: "openai",
    apiModel: "gpt-4o",
  },
  {
    id: "claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    description: "Anthropic · 균형 잡힌 추론",
    vendor: "anthropic",
    apiModel: DEFAULT_ANTHROPIC_MODEL,
  },
  {
    id: "claude-opus-4-1",
    label: "Claude Opus 4.1",
    description: "Anthropic · 고난도 분석용",
    vendor: "anthropic",
    apiModel: "claude-opus-4-1-20250805",
  },
];

const BY_ID = new Map(LLM_MODEL_OPTIONS.map((m) => [m.id, m]));

export function getModelOption(modelId: string | undefined): LlmModelOption | null {
  if (!modelId) return null;
  return BY_ID.get(modelId) ?? null;
}

/** 환경변수 기본 모델(별칭) — 없으면 첫 번째 후보 */
export function defaultModelIdFromEnv(): string {
  const fromEnv = process.env.AI_DEFAULT_MODEL?.trim();
  if (fromEnv && BY_ID.has(fromEnv)) return fromEnv;
  if (getOpenAiApiKey()) return "gpt-4o-mini";
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "claude-sonnet-4-5";
  return "gpt-4o-mini";
}
