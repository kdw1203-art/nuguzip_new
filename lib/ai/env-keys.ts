/** OpenAI 키 — Vercel 등에서 오타 방지용 별칭 허용 */
export function getOpenAiApiKey(): string | undefined {
  const a = process.env.OPENAI_API_KEY?.trim();
  if (a) return a;
  const b = process.env.OPENAI_KEY?.trim();
  return b || undefined;
}

export function getOpenAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

export function isOpenAiConfigured(): boolean {
  return Boolean(getOpenAiApiKey());
}

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}
